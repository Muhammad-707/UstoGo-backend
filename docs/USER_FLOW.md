# User Flows — UstoGo

**Version:** 1.0.0
**Last updated:** 2026-07-29

Flows are written from the API's point of view: each step names the endpoint, the state change and the side effects. Notation: `→` request, `⇒` resulting state, `✉` notification, `📝` audit entry.

---

## 1. Master Onboarding

```
Register → Complete profile → Add categories → Add services → Set schedule
   → Submit → [ADMIN REVIEW] → Approved ⇒ visible in search
                             → Rejected ⇒ edit → resubmit
```

| # | Actor | Call | Effect |
| --- | --- | --- | --- |
| 1 | Visitor | `POST /auth/register/master` | ⇒ `User(MASTER, ACTIVE)` + `MasterProfile(PENDING, isActive=false)`; tokens issued; ✉ admins |
| 2 | Master | `PATCH /users/me` | bio, experience, service radius, timezone |
| 3 | Master | `POST /files/presign` → PUT → `PATCH /users/me/avatar` | avatar stored |
| 4 | Master | `POST /masters/me/certificates` | certificates attached |
| 5 | Master | `POST /masters/me/categories` | ≥1 leaf category attached |
| 6 | Master | `POST /masters/me/services` | ≥1 active service — required for approval (BR-15) |
| 7 | Master | `PUT /masters/me/schedule` | weekly availability |
| 8 | Master | `POST /masters/me/submit` | ⇒ `PENDING` (no-op if already pending) |
| 9 | Admin | `GET /admin/masters?approvalStatus=PENDING` | review queue |
| 10a | Admin | `POST /admin/masters/:id/approve` | ⇒ `APPROVED`, `isActive=true`; ✉ master; 📝 |
| 10b | Admin | `POST /admin/masters/:id/reject` `{reason}` | ⇒ `REJECTED`; ✉ master with reason; 📝 |
| 11 | Master | edit → `POST /masters/me/resubmit` | ⇒ `PENDING` again |

**Failure branches**
- Approval attempted with no service → `409 MASTER_NOT_READY_FOR_APPROVAL`
- Master attempts to create a booking-visible service while `REJECTED` → allowed to edit, but remains invisible until re-approved

---

## 2. Client Registration → First Booking

```
Register → Search → Filter/sort → Open profile → Check availability
   → Create booking (PENDING) → [MASTER DECIDES]
        ├─ Accepted   ⇒ contact details unlocked → service delivered → completed → review
        ├─ Rejected   ⇒ client searches again
        └─ No answer  ⇒ EXPIRED by system job
```

| # | Actor | Call | Effect |
| --- | --- | --- | --- |
| 1 | Visitor | `POST /auth/register/client` | ⇒ `User(CLIENT, ACTIVE)` + `ClientProfile`; tokens |
| 2 | Client | `GET /categories` | browse the tree |
| 3 | Client | `GET /masters?categoryId=&cityId=&minRating=4&sort=rating:desc&page=1` | approved active masters only |
| 4 | Client | `GET /masters/:id` | public profile: services, rating, reviews, certificates |
| 5 | Client | `GET /masters/:id/availability?from=&to=&serviceId=` | computed free slots in UTC |
| 6 | Client | `POST /bookings` | ⇒ `PENDING`; service snapshot stored; ✉ master |
| 7 | Master | `GET /bookings?status=PENDING` | inbox; address shown at district level only |
| 8a | Master | `POST /bookings/:id/accept` | ⇒ `ACCEPTED` in a serializable txn; ✉ client; contact details unlocked |
| 8b | Master | `POST /bookings/:id/reject` `{reason}` | ⇒ `REJECTED`; ✉ client |
| 8c | System | expiry job | ⇒ `EXPIRED` after `scheduledAt` passes; ✉ both |
| 9 | Either | `POST /conversations` + messages | coordination (Phase 5) |
| 10 | Master | `POST /bookings/:id/start` | ⇒ `IN_PROGRESS`; not earlier than 30 min before start |
| 11 | Master | `POST /bookings/:id/complete` | ⇒ `COMPLETED`; ✉ client with a review invitation |
| 12 | Client | `POST /reviews` | rating + comment; master aggregates recomputed in the same txn; ✉ master |
| 13 | Master | `POST /reviews/:id/reply` | one public reply |

---

## 3. Cancellation Flows

**Client cancels**
```
PENDING  → POST /bookings/:id/cancel  ⇒ CANCELLED_BY_CLIENT           ✉ master
ACCEPTED → POST /bookings/:id/cancel  ⇒ CANCELLED_BY_CLIENT           ✉ master
           if now > scheduledAt - 3h  ⇒ isLateCancellation = true
```

**Master cancels** (reason mandatory)
```
ACCEPTED → POST /bookings/:id/cancel {reason} ⇒ CANCELLED_BY_MASTER   ✉ client
           counted against master reliability metrics
```

**Admin force-cancel** (dispute resolution, reason mandatory)
```
ACCEPTED | IN_PROGRESS → POST /admin/bookings/:id/cancel {reason}
   ⇒ CANCELLED_BY_ADMIN   ✉ both parties   📝 audit
```

In every case a `BookingStatusHistory` row is appended with the actor, the from/to states and the reason.

---

## 4. Authentication Session Flow

```
login ──► accessToken (15m) + refreshToken (30d, family F, generation 1)
   │
   ├─ access token expires ──► POST /auth/refresh {rt}
   │        ├─ valid & unused ⇒ mark used, issue generation n+1 in family F
   │        ├─ already used   ⇒ REVOKE ENTIRE FAMILY F, 401 REFRESH_TOKEN_REUSED
   │        └─ expired/revoked ⇒ 401 INVALID_REFRESH_TOKEN
   │
   ├─ logout      ⇒ revoke this token only
   ├─ logout-all  ⇒ revoke every token of the user
   └─ password change ⇒ revoke all except the current session
```

Reuse detection is the security core of this flow: a stolen refresh token is only usable until the legitimate client next refreshes, at which point both are locked out and the user must re-authenticate.

---

## 5. Password Reset

```
POST /auth/forgot-password {email}
   ⇒ ALWAYS 202 (no user enumeration)
   ⇒ if the user exists: single-use token (30 min), hash stored, email sent

POST /auth/reset-password {token, newPassword}
   ⇒ token invalid/expired/used ⇒ 400 INVALID_RESET_TOKEN
   ⇒ success ⇒ password updated, token consumed, ALL refresh tokens revoked
```

---

## 6. Admin Daily Operations

```
Login → Dashboard (/admin/dashboard)
   ├─ Pending master approvals  → review → approve / reject
   ├─ Bookings monitor          → filter disputes → force-cancel with reason
   ├─ Review moderation         → hide / unhide → aggregates recomputed
   ├─ Category maintenance      → create / rename / deactivate
   ├─ Banner scheduling         → set active window
   └─ Audit log review          → filter by actor / action / entity / period
```

Every mutation in this flow writes an `AuditLog` entry automatically via the audit interceptor — no service is responsible for remembering to do it.

---

## 7. Availability Computation (internal flow)

```
input: masterId, from, to, serviceId
  1. load master timezone and weekly WorkingDay rules
  2. expand rules across [from, to] in the master's local time
  3. apply ScheduleException per date (day off ⇒ drop, altered ⇒ replace)
  4. convert windows to UTC instants
  5. subtract ACCEPTED and IN_PROGRESS booking intervals
  6. subtract any window ending before now + minimum lead time (2h)
  7. chunk remaining windows by the service duration
output: array of UTC slot start times
```

This routine is pure and side-effect free, which makes it directly unit-testable — see `TESTING.md` §4.
