# Functional Requirements — UstoGo Backend

**Version:** 1.0.0
**Last updated:** 2026-07-29

Each requirement below is written as a testable behaviour with explicit acceptance criteria and failure modes. Error codes referenced here are defined in `ERROR_HANDLING.md`.

---

## 1. Registration

### FR-1.1 Client registration
**Endpoint:** `POST /api/v1/auth/register/client`

**Input:** `email`, `password`, `firstName`, `lastName`, `phone?`, `cityId?`

**Behaviour**
1. Normalise email (trim, lowercase).
2. Reject if a non-deleted user with that email exists → `409 EMAIL_ALREADY_EXISTS`.
3. Reject if phone is supplied and already used → `409 PHONE_ALREADY_EXISTS`.
4. Hash the password with bcrypt (cost 12).
5. In one transaction: create `User(role=CLIENT, status=ACTIVE)` and `ClientProfile`.
6. Issue an access token and a refresh token.
7. Emit `user.registered` domain event.

**Acceptance criteria**
- ✅ `201` with `{ user, accessToken, refreshToken, expiresIn }`
- ✅ Response contains no `passwordHash`
- ✅ Password shorter than 8 chars, or without one letter and one digit → `422 VALIDATION_FAILED`
- ✅ Duplicate email → `409`, and no partial rows are written

### FR-1.2 Master registration
**Endpoint:** `POST /api/v1/auth/register/master`

**Input:** `email`, `password`, `firstName`, `lastName`, `phone`, `cityId`, `displayName`, `bio?`, `yearsOfExperience?`, `categoryIds?`

**Behaviour** — as FR-1.1, but creates `MasterProfile` with `approvalStatus = PENDING`, `isActive = false`, and attaches any supplied leaf categories. Emits `master.registered`, which notifies admins.

**Acceptance criteria**
- ✅ `201`; the returned profile reports `approvalStatus: "PENDING"`
- ✅ Phone is mandatory for masters → missing phone yields `422`
- ✅ A non-leaf category id → `422 CATEGORY_NOT_LEAF`
- ✅ The new master does not appear in `GET /api/v1/masters`

### FR-1.3 Admin registration is impossible
- ✅ No route accepts `role` from the client. Supplying `"role": "ADMIN"` in any registration body is stripped by the validation whitelist and has no effect.
- ✅ There is no `POST /admin/register` in the OpenAPI document.

---

## 2. Authentication

### FR-2.1 Login
`POST /api/v1/auth/login` with `email`, `password`, optional `deviceId`.

- Unknown email and wrong password produce the **same** `401 INVALID_CREDENTIALS` response and the same latency profile (a dummy bcrypt comparison is executed when the user is absent).
- `status = BLOCKED` → `403 ACCOUNT_BLOCKED`; `status = INACTIVE` → `403 ACCOUNT_INACTIVE`.
- On success: create a `RefreshToken` row (hashed value, family id, device, IP, user agent, expiry) and return both tokens.
- Rate limit: 5 attempts / 15 min per IP+email pair → `429 TOO_MANY_REQUESTS`.

### FR-2.2 Refresh
`POST /api/v1/auth/refresh` with `refreshToken`.

- Look up by hash. Not found, expired, or revoked → `401 INVALID_REFRESH_TOKEN`.
- **Reuse detection:** if the presented token is already marked `usedAt`, revoke every token in the family and return `401 REFRESH_TOKEN_REUSED`.
- Otherwise mark used, issue a new pair in the same family, return them.

### FR-2.3 Logout / logout all
- `POST /api/v1/auth/logout` revokes the presented refresh token only.
- `POST /api/v1/auth/logout-all` revokes every refresh token of the caller.
- Both are idempotent and return `204`.

### FR-2.4 Password reset
- `POST /api/v1/auth/forgot-password` always returns `202`, regardless of whether the email exists.
- A single-use token valid for 30 minutes is emailed; only its hash is stored.
- `POST /api/v1/auth/reset-password` consumes the token, sets the new password and revokes all refresh tokens.

### FR-2.5 Change password
`PATCH /api/v1/auth/password` with `currentPassword`, `newPassword`.
- Wrong current password → `401 INVALID_CREDENTIALS`.
- New password equal to current → `422 PASSWORD_REUSED`.
- On success all refresh tokens except the current session are revoked.

---

## 3. Profiles

### FR-3.1 Read own profile
`GET /api/v1/users/me` returns the user plus the role-specific profile. Never returns `passwordHash`, refresh tokens, or internal moderation notes.

### FR-3.2 Update own profile
`PATCH /api/v1/users/me` — partial update. Email and role are not updatable here. A master editing profile fields while `approvalStatus = REJECTED` may call `POST /api/v1/masters/me/resubmit` to return to `PENDING`.

### FR-3.3 Avatar upload
1. `POST /api/v1/files/presign` → `{ uploadUrl, fileKey }`, constrained to `image/jpeg|png|webp` and ≤ 5 MB.
2. Client PUTs the binary directly to storage.
3. `PATCH /api/v1/users/me/avatar` with `fileKey` — the server verifies the object exists and its content type before persisting.

**Acceptance criteria:** an unverifiable or oversized object → `422 INVALID_FILE`; the previous avatar object is scheduled for deletion.

### FR-3.4 Certificates (master)
`POST|GET|DELETE /api/v1/masters/me/certificates`. PDF or image, ≤ 10 MB. A certificate carries `title`, `issuedBy?`, `issuedAt?`. Deletion is a soft delete.

---

## 4. Master Moderation

### FR-4.1 Approve
`POST /api/v1/admin/masters/:id/approve`
- Precondition: `approvalStatus = PENDING`, ≥ 1 category, ≥ 1 active service → otherwise `409 MASTER_NOT_READY_FOR_APPROVAL`.
- Effect: `approvalStatus = APPROVED`, `isActive = true`, `approvedAt`, `approvedBy`.
- Side effects: audit log entry, `MASTER_APPROVED` notification.

### FR-4.2 Reject
`POST /api/v1/admin/masters/:id/reject` with a mandatory `reason` (10–500 chars) → `approvalStatus = REJECTED`, reason stored, master notified, audited.

### FR-4.3 Activate / deactivate
`POST /api/v1/admin/masters/:id/activate` and `/deactivate` with a reason on deactivation.
Deactivation hides the master from search and blocks new bookings; existing `ACCEPTED` bookings are **not** auto-cancelled, and the response includes the count of affected bookings so operations can follow up.

---

## 5. Categories and Services

### FR-5.1 Category tree
`GET /api/v1/categories` — public, returns the active tree with `id`, `slug`, `name`, `iconKey`, `children`, `depth`, `isLeaf`. Cached for 5 minutes.

### FR-5.2 Category administration
`POST|PATCH|DELETE /api/v1/admin/categories`.
- Creating a child of a depth-3 category → `422 CATEGORY_DEPTH_EXCEEDED`.
- Deleting a category that has active services or children → `409 CATEGORY_IN_USE`; deactivation is the supported path.
- Slug is unique and immutable after creation.

### FR-5.3 Service CRUD (master)
`POST|GET|PATCH|DELETE /api/v1/masters/me/services`
- `categoryId` must be a leaf and must be one of the master's attached categories → else `422`.
- `priceType ∈ {FIXED, HOURLY, FROM}`; `price > 0`; `durationMinutes` between 15 and 1440, in 15-minute steps.
- Delete is a soft delete; existing bookings keep a denormalised copy of the service title and price.

---

## 6. Availability

### FR-6.1 Weekly schedule
`PUT /api/v1/masters/me/schedule` replaces the whole weekly schedule atomically with an array of `{ weekday, startTime, endTime }`.
- Overlapping ranges on the same weekday → `422 SCHEDULE_OVERLAP`.
- `endTime` must be after `startTime`.

### FR-6.2 Exceptions
`POST|DELETE /api/v1/masters/me/schedule/exceptions` with `{ date, isDayOff, startTime?, endTime? }`. One exception per date → `409 EXCEPTION_ALREADY_EXISTS`.

### FR-6.3 Slot computation
`GET /api/v1/masters/:id/availability?from=&to=&serviceId=`
- Range limited to 31 days → else `422`.
- Algorithm: expand weekly rules across the range in the master's timezone → apply exceptions → subtract `ACCEPTED` and `IN_PROGRESS` bookings → subtract time already elapsed today → chunk by the service duration → return UTC instants.
- ✅ Returns `[]` (not an error) when the master has no availability.

---

## 7. Booking Lifecycle

### 7.1 State machine

```
                 ┌──────────────────────── client cancels ─────────┐
                 │                                                 ▼
   create   ┌─────────┐   master accepts   ┌──────────┐   master starts   ┌─────────────┐   master completes   ┌───────────┐
 ─────────► │ PENDING │ ─────────────────► │ ACCEPTED │ ────────────────► │ IN_PROGRESS │ ───────────────────► │ COMPLETED │
            └────┬────┘                    └────┬─────┘                   └─────────────┘                      └───────────┘
                 │ master rejects               │ master cancels
                 ▼                              ▼
            ┌──────────┐                 ┌────────────────────┐
            │ REJECTED │                 │ CANCELLED_BY_MASTER│
            └──────────┘                 └────────────────────┘
                 │ start time passes            │ client cancels
                 ▼                              ▼
            ┌─────────┐                  ┌────────────────────┐
            │ EXPIRED │                  │ CANCELLED_BY_CLIENT│
            └─────────┘                  └────────────────────┘
```

Legal transitions — anything not listed is `409 ILLEGAL_BOOKING_TRANSITION`:

| From | To | Actor |
| --- | --- | --- |
| `PENDING` | `ACCEPTED` | master |
| `PENDING` | `REJECTED` | master (reason required) |
| `PENDING` | `CANCELLED_BY_CLIENT` | client |
| `PENDING` | `EXPIRED` | system job |
| `ACCEPTED` | `IN_PROGRESS` | master |
| `ACCEPTED` | `CANCELLED_BY_CLIENT` | client |
| `ACCEPTED` | `CANCELLED_BY_MASTER` | master (reason required) |
| `ACCEPTED` | `CANCELLED_BY_ADMIN` | admin (reason required) |
| `IN_PROGRESS` | `COMPLETED` | master |
| `IN_PROGRESS` | `CANCELLED_BY_ADMIN` | admin (reason required) |

### FR-7.1 Create booking
`POST /api/v1/bookings` with `masterId`, `serviceId`, `scheduledAt` (UTC ISO-8601), `address`, `note?`.

Validations, in order:
1. Master exists, `APPROVED`, `isActive`, not deleted → `404 MASTER_NOT_FOUND` / `409 MASTER_UNAVAILABLE`
2. Service belongs to that master and is active → `422 SERVICE_INVALID`
3. `scheduledAt` is ≥ 2 hours in the future → `422 SLOT_TOO_SOON`
4. Slot lies inside computed availability → `409 SLOT_NOT_AVAILABLE`
5. The client has no other `PENDING`/`ACCEPTED` booking overlapping this window → `409 CLIENT_SLOT_CONFLICT`
6. The client has fewer than 5 open `PENDING` bookings → `429 TOO_MANY_PENDING_BOOKINGS`

On success: create the booking with a denormalised service snapshot (`serviceTitle`, `price`, `priceType`, `durationMinutes`), append history, notify the master.

### FR-7.2 Accept
`POST /api/v1/bookings/:id/accept` — master only, owner only.
Executed in a `SERIALIZABLE` transaction: re-check availability, re-check overlap against other `ACCEPTED` bookings, then transition. Concurrent acceptance of overlapping slots → exactly one succeeds, the other gets `409 BOOKING_OVERLAP`.

### FR-7.3 Reject / cancel
- `POST /:id/reject` — master, `PENDING` only, reason 10–500 chars.
- `POST /:id/cancel` — client or master, per the matrix above. Reason mandatory for the master. Cancelling `ACCEPTED` within 3 hours of `scheduledAt` sets `isLateCancellation = true`.
- `POST /api/v1/admin/bookings/:id/cancel` — admin, reason mandatory, audited.

### FR-7.4 Start / complete
- `POST /:id/start` — master, `ACCEPTED` only, not earlier than 30 minutes before `scheduledAt` → else `422 TOO_EARLY_TO_START`.
- `POST /:id/complete` — master, `IN_PROGRESS` only. Sets `completedAt`, notifies the client and creates a `REVIEW_INVITATION` notification.

### FR-7.5 Expiry job
Runs every 10 minutes. Selects `PENDING` bookings with `scheduledAt < now()`, transitions them to `EXPIRED` in batches of 100, appends history with actor `SYSTEM`, notifies both parties. The job is idempotent and safe to run concurrently (row-level `FOR UPDATE SKIP LOCKED`).

### FR-7.6 Reading bookings
- `GET /api/v1/bookings` — role-scoped: a client sees their own, a master sees theirs; filters `status`, `from`, `to`; paginated.
- `GET /api/v1/bookings/:id` — participants and admins only → else `404` (not `403`, to avoid leaking existence).
- Client contact fields (`phone`, exact `address`) appear in the master's view only when the status is `ACCEPTED`, `IN_PROGRESS` or `COMPLETED`. Before that, the address is truncated to district level.

---

## 8. Reviews

### FR-8.1 Create
`POST /api/v1/reviews` with `bookingId`, `rating`, `comment?`.
- Booking must exist, belong to the caller, and be `COMPLETED` → `409 BOOKING_NOT_COMPLETED`
- Not already reviewed → `409 REVIEW_ALREADY_EXISTS`
- Within 30 days of `completedAt` → `409 REVIEW_WINDOW_CLOSED`
- Transaction: insert review → recompute `ratingAverage`, `ratingCount` on `MasterProfile` → notify master

### FR-8.2 Edit
`PATCH /api/v1/reviews/:id` — author only, within 24 hours of creation → else `409 REVIEW_EDIT_WINDOW_CLOSED`. Aggregates recomputed.

### FR-8.3 Reply
`POST /api/v1/reviews/:id/reply` — the reviewed master only, one reply per review → `409 REPLY_ALREADY_EXISTS`.

### FR-8.4 Moderate
`POST /api/v1/admin/reviews/:id/hide` / `/unhide` with a reason. Hidden reviews are excluded from public listings and from aggregates; aggregates are recomputed on both actions.

### FR-8.5 Public listing
`GET /api/v1/masters/:id/reviews` — visible reviews only, paginated, sortable by recency or rating, includes the rating distribution `{1..5: count}`.

---

## 9. Notifications

### FR-9.1 Generation
A notification is written for: booking created, accepted, rejected, cancelled (either side), started, completed, expired; master approved / rejected / deactivated; new review; review reply; new message; admin broadcast.

### FR-9.2 Shape
`{ id, type, payload, isRead, createdAt }` where `type` is a stable enum code and `payload` is a typed JSON object (e.g. `{ bookingId, masterName, scheduledAt }`). The server never stores rendered prose — clients localise from `type` + `payload`.

### FR-9.3 Endpoints
`GET /api/v1/notifications` (paginated, `?isRead=`), `GET /unread-count`, `PATCH /:id/read`, `PATCH /read-all`. All strictly scoped to the caller.

---

## 10. Messaging (contract defined; implementation deferred to Phase 5)

- `POST /api/v1/conversations` `{ participantId }` → creates or returns the existing conversation; requires a shared non-expired booking → else `403 NO_SHARED_BOOKING`.
- `GET /api/v1/conversations` — paginated, ordered by `lastMessageAt`, includes unread counts.
- `GET /api/v1/conversations/:id/messages?cursor=&limit=` — cursor pagination, newest first.
- `POST /api/v1/conversations/:id/messages` `{ body, attachmentKeys? }` — max 4000 chars.
- `PATCH /api/v1/conversations/:id/read`.
- Socket.io namespace `/chat`, JWT handshake, events `message:new`, `message:read`, `typing`. The REST contract is complete without it.

---

## 11. Administration

### FR-11.1 Dashboard
`GET /api/v1/admin/dashboard?from=&to=` returns: user counts by role and status; masters by approval status; pending approvals count; bookings by status; completion and cancellation rates; average rating; review count; top 10 categories by booking volume; a daily booking time series.

### FR-11.2 Banners
`POST|GET|PATCH|DELETE /api/v1/admin/banners` with `title`, `imageKey`, `linkUrl?`, `position`, `sortOrder`, `startsAt?`, `endsAt?`, `isActive`.
Public read: `GET /api/v1/banners?position=` returns only banners active for the current instant.

### FR-11.3 Audit log
`GET /api/v1/admin/audit-logs` — filter by actor, action, entity type, date range. Append-only: there is no create, update or delete endpoint.

---

## 12. Cross-cutting

| ID | Requirement |
| --- | --- |
| FR-X-1 | Every list endpoint accepts `page` (≥1, default 1) and `limit` (1–100, default 20) and returns `{ items, meta: { page, limit, total, totalPages, hasNext, hasPrev } }`. |
| FR-X-2 | Every mutating endpoint validates its body against a DTO with `whitelist: true, forbidNonWhitelisted: true, transform: true`. |
| FR-X-3 | Unknown routes return the standard `404` envelope, never an HTML page. |
| FR-X-4 | `GET /health` (liveness) and `GET /health/ready` (DB + storage reachability) are public and unauthenticated. |
| FR-X-5 | Every response carries `X-Request-Id`. |
| FR-X-6 | Soft-deleted records are excluded from every read path by a Prisma middleware, with an explicit opt-in for admin queries. |
