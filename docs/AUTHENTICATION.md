# Authentication — UstoGo

**Version:** 1.0.0 · **Last updated:** 2026-07-29
**Related:** `AUTHORIZATION.md` (what you may do), `SECURITY.md` (threat model)

Authentication answers _who is calling_. Authorization answers _what they may do_. This document covers the former only.

---

## 1. Model

| Element                   | Choice                                             | Rationale                                                                           |
| ------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Scheme                    | Bearer JWT                                         | Stateless verification, no session store on the request path                        |
| Access token              | JWT, 15 minutes                                    | Short enough that revocation lag is acceptable, long enough to avoid refresh storms |
| Refresh token             | Opaque random 512-bit value, 30 days, **rotating** | Revocable, forensically traceable, immune to JWT replay                             |
| Storage of refresh tokens | SHA-256 hash in `refresh_tokens`                   | A database dump does not yield usable sessions                                      |
| Password hashing          | bcrypt, cost 12                                    | Adaptive, well-understood, `$2b$`                                                   |

Refresh tokens are _not_ JWTs. A JWT refresh token cannot be revoked without a database lookup, which removes its only advantage. We use a random opaque value and look it up by hash.

---

## 2. Access Token

**Algorithm:** RS256 (Phase 6, migrated from HS256). A private key signs, a public key verifies — a service that only ever verifies tokens (or a future key-rotation setup) never needs the private key.

**Claims**

```json
{
  "sub": "9f1c…", // user id
  "role": "MASTER",
  "status": "ACTIVE",
  "sid": "3b8e…", // refresh token family id — enables family-level revocation checks
  "iat": 1785000000,
  "exp": 1785000900,
  "iss": "ustogo-api",
  "aud": "ustogo-clients"
}
```

Rules

- The payload carries **no PII** — no email, no name, no phone.
- `role` in the token is a fast path; any endpoint that changes behaviour based on a mutable attribute (`status`, `approvalStatus`) re-reads it from the database.
- Clock skew tolerance is 30 seconds.
- `iss` and `aud` are verified, not merely present.

**Verification pipeline:** `JwtAuthGuard` (global) → `JwtStrategy.validate()` → loads the user → rejects if the user is missing, soft-deleted, or not `ACTIVE` → attaches a typed `AuthenticatedUser` to `request.user`.

Because `validate()` performs one indexed primary-key lookup per request, a `BLOCKED` user loses access immediately rather than after token expiry. The cost is one cached point query; the benefit is that the revocation window collapses to zero.

---

## 3. Refresh Token Rotation

Every refresh consumes one token and issues the next in the same **family**. A family is created at login and identified by `familyId`.

```
login          → T1 (family F, unused)
refresh(T1)    → T1.usedAt = now, issue T2 (family F)
refresh(T2)    → T2.usedAt = now, issue T3 (family F)
refresh(T1)    → T1 already used ⇒ REUSE DETECTED
                 revoke every token in family F
                 401 REFRESH_TOKEN_REUSED
```

**Why this matters.** With rotation plus reuse detection, a stolen refresh token is useful only until the legitimate client refreshes next. At that moment the theft becomes _detectable_ and both parties are logged out. Without detection, the attacker holds a 30-day credential silently.

**Implementation notes**

- Consume-and-issue happens in a single transaction; `tokenHash` carries a unique index so a concurrent double-refresh produces exactly one winner.
- The raw token is returned to the client exactly once and never logged.
- Rotation writes `revokedReason = 'ROTATION'` on the consumed row rather than deleting it — the trail is needed for reuse detection.

---

## 4. Session Lifecycle Events

| Event                | Effect on refresh tokens                                             |
| -------------------- | -------------------------------------------------------------------- |
| Login                | New family, one token                                                |
| Refresh              | Current consumed, successor issued in the same family                |
| Logout               | Presented token revoked (`LOGOUT`)                                   |
| Logout all           | Every token of the user revoked                                      |
| Password change      | All revoked except the caller's current session (`PASSWORD_CHANGED`) |
| Password reset       | **All** revoked, including the caller's                              |
| Admin block          | All revoked (`ADMIN_ACTION`)                                         |
| Account deactivation | All revoked                                                          |
| Reuse detected       | Entire family revoked (`REUSE_DETECTED`)                             |

---

## 5. Registration

```
POST /auth/register/{client|master}
  ├─ normalise email (trim + lowercase; column is citext)
  ├─ uniqueness check on email and phone (live rows only)
  ├─ bcrypt hash, cost 12
  ├─ TRANSACTION: create User → create role profile → attach categories (master)
  ├─ issue token pair
  └─ emit user.registered / master.registered
```

There is no code path that creates an `ADMIN`. `role` is never read from the request body — the whitelist validation strips it, and the service passes the role as a literal constant.

Admin bootstrap:

```bash
npm run cli -- admin:create --email=ops@ustogo.app
# prompts for a password interactively; never accepts it as an argv value
```

---

## 6. Login and User Enumeration

```ts
const user = await this.users.findByEmail(email);
if (!user) {
  await bcrypt.compare(password, DUMMY_HASH); // constant-time-ish parity
  throw new InvalidCredentialsException();
}
if (!(await bcrypt.compare(password, user.passwordHash))) {
  throw new InvalidCredentialsException();
}
```

Unknown email and wrong password produce an identical response body, identical status code and a comparable latency profile. `ACCOUNT_BLOCKED` and `ACCOUNT_INACTIVE` are returned only _after_ the password verifies — otherwise the status itself becomes an enumeration oracle.

`/auth/forgot-password` always returns `202` for the same reason.

---

## 7. Password Policy

| Rule                          | Value                                                                    |
| ----------------------------- | ------------------------------------------------------------------------ |
| Minimum length                | 8                                                                        |
| Composition                   | ≥1 letter and ≥1 digit                                                   |
| Maximum length                | 72 bytes (bcrypt truncation boundary — enforced, not silently truncated) |
| Reuse of the current password | Rejected (`422 PASSWORD_REUSED`)                                         |
| Storage                       | bcrypt cost 12                                                           |
| Transport                     | Only over TLS; never in a query string; never logged                     |

Deliberately excluded: forced special characters and mandatory rotation. Both are documented as counterproductive by current NIST guidance and push users toward weaker, predictable passwords.

---

## 8. Password Reset

```
POST /auth/forgot-password { email }
  → 202 always
  → if the user exists:
        raw = crypto.randomBytes(32).toString('base64url')
        store SHA-256(raw), expiresAt = now + 30 min
        email a link containing raw

POST /auth/reset-password { token, newPassword }
  → look up by hash
  → reject if missing, expired or already used → 400 INVALID_RESET_TOKEN
  → TRANSACTION: set new hash, mark token used, revoke ALL refresh tokens
  → send a "your password was changed" notification email
```

Only one active reset token per user: issuing a new one invalidates the previous.

---

## 9. Rate Limiting

| Endpoint                | Limit      | Key        |
| ----------------------- | ---------- | ---------- |
| `/auth/login`           | 5 / 15 min | IP + email |
| `/auth/register/*`      | 5 / hour   | IP         |
| `/auth/forgot-password` | 3 / hour   | email      |
| `/auth/reset-password`  | 5 / hour   | IP         |
| `/auth/refresh`         | 30 / hour  | userId     |

Backed by `@nestjs/throttler`. In multi-instance deployments the storage adapter is Redis so limits are global rather than per-instance.

---

## 10. Client Integration Guidance

**Token storage**

- Web: access token in memory only; refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie set by the client's own BFF, or in the most protected storage available. `localStorage` is discouraged and documented as such.
- Mobile: Keychain (iOS) / EncryptedSharedPreferences (Android).

**Refresh strategy**

- Refresh proactively at ~80% of the access token lifetime, or reactively on the first `401`.
- Serialise refreshes: concurrent 401s must await a single in-flight refresh, otherwise rotation will trigger a false reuse detection and log the user out. This is the single most common client-side integration bug — it is called out explicitly in the Swagger description of `/auth/refresh`.

**On `401 REFRESH_TOKEN_REUSED`:** clear all credentials and force re-login. Do not retry.

---

## 11. Configuration

| Variable                 | Example          | Notes                                                    |
| ------------------------ | ---------------- | -------------------------------------------------------- |
| `JWT_ACCESS_PRIVATE_KEY` | base64 PKCS8 PEM | RS256 signing key, enforced at boot                      |
| `JWT_ACCESS_PUBLIC_KEY`  | base64 SPKI PEM  | RS256 verification key, must differ from the private key |
| `JWT_ACCESS_TTL`         | `15m`            |                                                          |
| `JWT_REFRESH_TTL`        | `30d`            |                                                          |
| `JWT_ISSUER`             | `ustogo-api`     |                                                          |
| `JWT_AUDIENCE`           | `ustogo-clients` |                                                          |
| `BCRYPT_ROUNDS`          | `12`             |                                                          |
| `PASSWORD_RESET_TTL`     | `30m`            |                                                          |

The configuration schema is validated at boot with Zod. Missing or short secrets cause the process to exit before it binds a port — a misconfigured instance must never accept traffic.

---

## 12. Test Requirements

The auth module requires **100% branch coverage** (NFR-Q-1). Mandatory cases:

- Registration: success, duplicate email, duplicate phone, weak password, attempted `role` injection
- Login: success, wrong password, unknown email (identical response), blocked, inactive, rate limited
- Refresh: success, expired, revoked, **reuse detection revoking the family**, concurrent refresh yielding exactly one winner
- Logout / logout-all idempotency
- Password change revoking other sessions but not the caller's
- Password reset: token single use, expiry, all-session revocation
- Guard: missing header, malformed token, wrong `iss`/`aud`, expired token, valid token for a deleted user, valid token for a blocked user
