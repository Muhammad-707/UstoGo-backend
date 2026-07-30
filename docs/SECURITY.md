# Security — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29
**Related:** `AUTHENTICATION.md`, `AUTHORIZATION.md`, `VALIDATION.md`

---

## 1. Threat Model

Assets, ranked by what an attacker gains:

| Asset                       | Impact if compromised                                                |
| --------------------------- | -------------------------------------------------------------------- |
| Password hashes             | Credential stuffing across other services                            |
| Refresh tokens              | Persistent account takeover                                          |
| Client PII (phone, address) | Physical safety risk — a home address plus a known-empty time window |
| Booking data                | Business intelligence, targeted fraud                                |
| Admin account               | Full platform control                                                |
| Audit log integrity         | Loss of accountability, undetectable abuse                           |

Adversaries considered: unauthenticated internet attacker; authenticated client attacking other users; **authenticated master attacking clients** (highest-value insider path, since masters legitimately receive addresses); a compromised admin account; an attacker with read access to a database backup.

The master-as-adversary case is why address disclosure is gated on acceptance and why every disclosure boundary is tested.

---

## 2. Controls by Category

### 2.1 Transport

- TLS 1.2+ terminated at the load balancer; HTTP redirects to HTTPS
- HSTS `max-age=31536000; includeSubDomains; preload`
- The application refuses to issue `Secure`-less cookies in production

### 2.2 Headers (Helmet)

```
Content-Security-Policy: default-src 'none'   (API returns JSON only)
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
X-Powered-By: removed
```

### 2.3 CORS

Explicit origin allowlist from configuration. `*` is rejected at boot when `NODE_ENV=production`. Allowed methods and headers are enumerated; credentials mode is explicit.

### 2.4 Input

See `VALIDATION.md`. Whitelisted DTOs, no implicit coercion, size-capped payloads (`json` body limit 1 MB), array size caps.

### 2.5 Database

- All queries parameterised through Prisma
- Raw SQL only via `Prisma.sql` tagged templates; `$queryRawUnsafe` is banned by lint rule
- The application database role has `SELECT/INSERT/UPDATE/DELETE` only — no `DDL`, no `SUPERUSER`. Migrations run under a separate role in a separate deploy step.
- Connection string held in a secret manager, never in the image

### 2.6 Secrets

- Zero secrets in the repository; `.env` is git-ignored, `.env.example` contains placeholders only
- Boot-time schema validation rejects missing secrets and secrets shorter than 32 characters
- Rotation procedure documented in `DEPLOYMENT.md`; access and refresh secrets are independent values
- CI secret scanning (gitleaks) runs on every push

### 2.7 File uploads

- Presigned PUT directly to object storage; binaries never pass through the API
- Server-side verification after upload: HEAD the object, check the real content type and size, then mark confirmed
- Extension and declared MIME are both untrusted; the stored object's metadata is authoritative
- Files are served from a distinct domain, so a malicious upload cannot execute in the API's origin
- Presigned read URLs expire in 15 minutes
- Unconfirmed objects are purged after 24 hours

### 2.8 Rate limiting

Global and per-endpoint limits as tabulated in `API.md` §13, keyed by IP for anonymous traffic and by user id for authenticated traffic, backed by Redis so limits are cluster-wide.

### 2.9 Audit

Every privileged mutation writes an append-only `AuditLog` row with actor, action, entity, before/after diff, reason, IP and user agent. The diff redactor strips `passwordHash`, `tokenHash` and reset tokens. There is no update or delete path in code, and the database role has no `DELETE` grant on that table.

---

## 3. OWASP API Security Top 10 — Coverage

| Risk                                                     | Control                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API1 Broken Object Level Authorization**               | Ownership checked in services on every resource read; `404` (not `403`) for foreign resources; six mandatory authz tests per endpoint (`AUTHORIZATION.md` §8) |
| **API2 Broken Authentication**                           | Short access tokens, rotating hashed refresh tokens with reuse detection, uniform login failures, bcrypt cost 12, strict rate limits                          |
| **API3 Broken Object Property Level Authorization**      | Response DTOs with explicit `@Expose`; conditional field disclosure (client phone/address only after acceptance); `whitelist` blocks mass assignment          |
| **API4 Unrestricted Resource Consumption**               | Pagination capped at 100, body limit 1 MB, date ranges capped at 31 days, per-endpoint throttling, upload size limits, database statement timeout             |
| **API5 Broken Function Level Authorization**             | Global fail-closed guard, declarative `@Roles`, admin routes namespaced under `/admin` and role-guarded at the controller class                               |
| **API6 Unrestricted Access to Sensitive Business Flows** | Booking creation limited to 10/hour and 5 concurrent pending; review creation limited to 10/day and gated on a completed booking                              |
| **API7 SSRF**                                            | The API fetches no user-supplied URLs. `linkUrl` on banners is stored and rendered by clients, validated as `https://` with a scheme allowlist.               |
| **API8 Security Misconfiguration**                       | Helmet, strict CORS, boot-time config validation, non-root container, production error messages without stacks, `X-Powered-By` removed                        |
| **API9 Improper Inventory Management**                   | Single versioned surface `/api/v1`, OpenAPI generated from code so it cannot drift, deprecation headers with a 90-day sunset                                  |
| **API10 Unsafe Consumption of Third-Party APIs**         | Only SMTP and S3; both behind interfaces with timeouts, retries and circuit breaking; failures degrade rather than propagate                                  |

---

## 4. Data Protection

| Data          | At rest                      | In transit  | In logs                    |
| ------------- | ---------------------------- | ----------- | -------------------------- |
| Password      | bcrypt cost 12               | TLS         | never                      |
| Refresh token | SHA-256 hash                 | TLS         | never                      |
| Reset token   | SHA-256 hash                 | TLS + email | never                      |
| Email         | plaintext (needed for login) | TLS         | id only, never the address |
| Phone         | plaintext                    | TLS         | never                      |
| Address       | plaintext                    | TLS         | never                      |
| Chat content  | plaintext                    | TLS         | never                      |

Database volumes are encrypted at rest by the infrastructure provider. Backups are encrypted and access-controlled.

**Minimisation by design:** a master receives a client's phone number and full address only once they have accepted the booking. Before that, only the district is exposed. This limits harvesting by fake master accounts and is enforced in the response mapper plus an explicit e2e test.

---

## 5. Account Security

| Control                          | Behaviour                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Login throttling                 | 5 attempts / 15 min per IP+email                                                          |
| Enumeration resistance           | Identical responses for unknown email and wrong password; `202` always on forgot-password |
| Session revocation               | Password change, reset, block and deactivation all revoke refresh tokens                  |
| Reuse detection                  | Presenting a consumed refresh token revokes the entire family                             |
| Notification on sensitive change | Email sent on password change and on password reset completion                            |
| Admin actions                    | Always audited, always reason-bearing where they affect a user                            |

Deferred to Phase 6, now landing: email verification (done), TOTP two-factor for admin accounts (done — `EmailVerificationService`, `TwoFactorService`) and the device/session list with per-device revocation (done — `GET/DELETE /auth/sessions`, `TokenService`).

---

## 6. Dependency & Supply Chain

- `npm audit --audit-level=high` in CI; a high or critical finding blocks the merge
- Dependabot (or equivalent) weekly; security patches merged within 7 days
- Lockfile committed; `npm ci` used everywhere, including in the Dockerfile
- No dependency added without a rationale recorded in the pull request (`PROJECT_RULES.md`)
- Container images pinned by digest; base image rebuilt weekly
- `gitleaks` secret scanning on every push

---

## 7. Secure Coding Rules

```ts
// ❌ interpolated SQL
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);
// ✅ parameterised
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;

// ❌ returning the entity (leaks passwordHash)
return this.prisma.user.findUnique({ where: { id } });
// ✅ explicit projection
return UserResponseDto.fromEntity(await this.users.findByIdSafe(id));

// ❌ trusting a client-supplied identity
@Get() list(@Query('userId') userId: string) { … }
// ✅ identity from the verified token
@Get() list(@CurrentUser() user: AuthenticatedUser) { … }

// ❌ leaking existence
if (booking.clientId !== user.id) throw new ForbiddenException();
// ✅ indistinguishable from absent
if (!isParticipant) throw new BookingNotFoundException();

// ❌ non-constant-time comparison of a secret
if (token === stored) { … }
// ✅
if (crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(stored))) { … }
```

---

## 8. Incident Response

1. **Detect** — alerts on 401/403 spikes, 5xx rate, refresh-reuse events, unusual admin activity
2. **Contain** — block the offending IP at the edge; revoke affected sessions; if a secret leaked, rotate immediately (all sessions invalidate by design)
3. **Assess** — reconstruct activity from `AuditLog` and request-id-correlated logs
4. **Notify** — affected users within 72 hours where personal data is implicated
5. **Remediate** — patch, add a regression test, and record the incident in `CHANGELOG.md` under Security

**Compromised JWT secret:** rotating `JWT_ACCESS_SECRET` invalidates every access token instantly; refresh tokens are database-backed and unaffected, so users transparently recover on their next refresh. This asymmetry is intentional and is the reason refresh tokens are not JWTs.

---

## 9. Security Checklist for Pull Requests

- [ ] New endpoints are protected by default; any `@Public()` is justified in the description
- [ ] Ownership is verified in the service, and foreign resources return `404`
- [ ] The response DTO exposes no field the caller is not entitled to
- [ ] No secret, token or PII is added to a log line
- [ ] New input is fully validated and length-capped
- [ ] Errors do not leak internal detail
- [ ] Privileged mutations are audited
- [ ] Rate limits are considered for expensive or abusable operations
- [ ] New dependencies are justified and clean under audit
- [ ] Authorization tests cover the 401/403/404/200 matrix
