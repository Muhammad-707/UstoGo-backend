# REST API Specification — UstoGo

**Version:** 1.0.0 · **Base path:** `/api/v1` · **Last updated:** 2026-07-29
**Interactive docs:** `/api/docs` (see `SWAGGER_GUIDE.md`)

---

## 1. Conventions

### 1.1 Authentication

All endpoints require `Authorization: Bearer <accessToken>` unless marked **Public**.

### 1.2 Content type

`application/json` for requests and responses. File binaries never traverse the API — they go directly to object storage via presigned URLs.

### 1.3 Success envelope

Responses return the resource directly (no wrapper) for single objects, and a paginated envelope for collections:

```json
{
  "items": [/* ... */],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 137,
    "totalPages": 7,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 1.4 Error envelope

Defined once in `ERROR_HANDLING.md`:

```json
{
  "statusCode": 409,
  "code": "SLOT_NOT_AVAILABLE",
  "message": "The requested time slot is no longer available.",
  "details": [],
  "path": "/api/v1/bookings",
  "timestamp": "2026-07-29T10:15:00.000Z",
  "requestId": "01J9X4K7..."
}
```

### 1.5 Common query parameters

| Param    | Type      | Default           | Notes                                                |
| -------- | --------- | ----------------- | ---------------------------------------------------- |
| `page`   | int ≥ 1   | 1                 |                                                      |
| `limit`  | int 1–100 | 20                | hard cap 100                                         |
| `sort`   | string    | endpoint-specific | `field:asc` / `field:desc`, allowlisted per endpoint |
| `search` | string    | —                 | trimmed, ≤ 100 chars                                 |

### 1.6 Status codes

| Code | Used for                                                      |
| ---- | ------------------------------------------------------------- |
| 200  | Successful read or update                                     |
| 201  | Resource created                                              |
| 202  | Accepted for asynchronous processing (password reset request) |
| 204  | Successful action with no body (logout, mark read)            |
| 400  | Malformed request                                             |
| 401  | Missing, invalid or expired credentials                       |
| 403  | Authenticated but not permitted                               |
| 404  | Not found, or found but not visible to the caller             |
| 409  | Conflict with current resource state                          |
| 422  | Validation failure                                            |
| 429  | Rate limit exceeded                                           |
| 500  | Unhandled server error                                        |

### 1.7 Headers

| Header            | Direction | Purpose                               |
| ----------------- | --------- | ------------------------------------- |
| `Authorization`   | request   | `Bearer <jwt>`                        |
| `X-Request-Id`    | both      | correlation id, generated when absent |
| `Accept-Language` | request   | client locale hint for emails         |
| `Retry-After`     | response  | present on 429                        |

---

## 2. Health — Public

| Method | Path            | Description                                                         |
| ------ | --------------- | ------------------------------------------------------------------- |
| GET    | `/health`       | Liveness. Always 200 if the process is up.                          |
| GET    | `/health/ready` | Readiness. Checks PostgreSQL and object storage. 503 when degraded. |

---

## 3. Auth — `/auth`

| Method | Path                    | Auth   | Description                                                       |
| ------ | ----------------------- | ------ | ----------------------------------------------------------------- |
| POST   | `/auth/register/client` | Public | Register a client → 201 `AuthResponse`                            |
| POST   | `/auth/register/master` | Public | Register a master (`approvalStatus=PENDING`) → 201 `AuthResponse` |
| POST   | `/auth/login`           | Public | → 200 `AuthResponse`                                              |
| POST   | `/auth/refresh`         | Public | Rotate tokens → 200 `AuthResponse`                                |
| POST   | `/auth/logout`          | Any    | Revoke the presented refresh token → 204                          |
| POST   | `/auth/logout-all`      | Any    | Revoke every session → 204                                        |
| POST   | `/auth/forgot-password` | Public | Always 202                                                        |
| POST   | `/auth/reset-password`  | Public | → 204                                                             |
| PATCH  | `/auth/password`        | Any    | Change password → 204                                             |

**`AuthResponse`**

```json
{
  "user": { "id": "…", "email": "…", "role": "MASTER", "status": "ACTIVE", "profile": {} },
  "accessToken": "eyJ…",
  "refreshToken": "…",
  "expiresIn": 900
}
```

**Errors:** `409 EMAIL_ALREADY_EXISTS`, `409 PHONE_ALREADY_EXISTS`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_BLOCKED`, `403 ACCOUNT_INACTIVE`, `401 REFRESH_TOKEN_REUSED`, `429 TOO_MANY_REQUESTS`.

---

## 4. Users — `/users`

| Method | Path               | Auth   | Description                                                         |
| ------ | ------------------ | ------ | ------------------------------------------------------------------- |
| GET    | `/users/me`        | Any    | Own user + role profile                                             |
| PATCH  | `/users/me`        | Any    | Partial profile update                                              |
| PATCH  | `/users/me/avatar` | Any    | Attach a confirmed `fileId` (see FR-3.3 on why the id, not the key) |
| DELETE | `/users/me`        | Any    | Soft-delete own account, revoke all sessions → 204                  |
| GET    | `/cities`          | Public | Reference list of active cities                                     |

---

## 5. Files — `/files`

| Method | Path                 | Auth | Description                                                                                 |
| ------ | -------------------- | ---- | ------------------------------------------------------------------------------------------- |
| POST   | `/files/presign`     | Any  | `{ purpose, mimeType, sizeBytes, fileName? }` → `{ fileId, uploadUrl, fileKey, expiresIn }` |
| POST   | `/files/:id/confirm` | Any  | Server verifies the object, marks it confirmed                                              |
| GET    | `/files/:id/url`     | Any  | Short-lived read URL for an **own** confirmed file                                          |

Constraints: avatars `image/jpeg|png|webp` ≤ 5 MB; certificates additionally `application/pdf` ≤ 10 MB; attachments ≤ 10 MB. Banner and category artwork take the avatar image rules — the specification gives them no limits of their own, and leaving them open would make `purpose` a way around every other row in this table. Rate limit 20 presigns/hour/user.

`GET /files/:id/url` is scoped to the uploader and returns `404` for anyone else's file, so ids cannot be walked for another master's certificates. A file that is visible to others by design — a master's avatar in a search result — is not read through this endpoint; the module owning that projection has already decided the caller may see it and signs the URL itself.

**Errors:** `422 UNSUPPORTED_MIME_TYPE`, `422 FILE_TOO_LARGE`, `422 INVALID_FILE`, `404 FILE_NOT_FOUND`, `409 FILE_NOT_CONFIRMED`, `429 TOO_MANY_REQUESTS`.

---

## 6. Categories — `/categories`

| Method | Path                | Auth   | Description                                 |
| ------ | ------------------- | ------ | ------------------------------------------- |
| GET    | `/categories`       | Public | Active tree; `?flat=true` for a flat list   |
| GET    | `/categories/:slug` | Public | Single category with ancestors and children |

Admin mutations live under `/admin/categories` (§12).

---

## 7. Masters (public) — `/masters`

| Method | Path                        | Auth   | Description                                                         |
| ------ | --------------------------- | ------ | ------------------------------------------------------------------- |
| GET    | `/masters`                  | Public | Search & filter. Returns approved, active, non-deleted masters only |
| GET    | `/masters/:id`              | Public | Public profile projection                                           |
| GET    | `/masters/:id/services`     | Public | Active services                                                     |
| GET    | `/masters/:id/reviews`      | Public | Visible reviews + rating distribution                               |
| GET    | `/masters/:id/availability` | Public | Computed slots; `from`, `to` (≤ 31 days), `serviceId`               |

**`GET /masters` query parameters**

| Param                  | Type       | Notes                                                                                |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `search`               | string     | full-text over display name, bio, service titles                                     |
| `categoryId`           | uuid       | includes descendant categories                                                       |
| `cityId`               | uuid       |                                                                                      |
| `minRating`            | number 0–5 |                                                                                      |
| `minPrice`, `maxPrice` | decimal    | matches any of the master's services                                                 |
| `availableOn`          | date       | masters with ≥1 free slot that day                                                   |
| `hasCertificates`      | boolean    |                                                                                      |
| `sort`                 | enum       | `rating:desc` (default), `reviews:desc`, `price:asc`, `price:desc`, `createdAt:desc` |

Response items expose: `id`, `displayName`, `avatarUrl`, `bio` (truncated), `cityName`, `categories[]`, `ratingAverage`, `ratingCount`, `completedBookingsCount`, `priceFrom`, `hasCertificates`. **Never** email, phone or address.

---

## 8. Master self-service — `/masters/me`

| Method                | Path                              | Description                                                      |
| --------------------- | --------------------------------- | ---------------------------------------------------------------- |
| GET                   | `/masters/me`                     | Own full profile including moderation state and rejection reason |
| PATCH                 | `/masters/me`                     | Update professional fields                                       |
| POST                  | `/masters/me/submit`              | Submit for review → `PENDING`                                    |
| POST                  | `/masters/me/resubmit`            | After rejection → `PENDING`                                      |
| GET/POST/DELETE       | `/masters/me/categories`          | Attach / detach leaf categories                                  |
| GET/POST/DELETE       | `/masters/me/certificates`        | Manage certificates                                              |
| GET/POST/PATCH/DELETE | `/masters/me/services`            | Service CRUD                                                     |
| GET                   | `/masters/me/schedule`            | Weekly schedule                                                  |
| PUT                   | `/masters/me/schedule`            | Atomic replacement of the weekly schedule                        |
| GET/POST/DELETE       | `/masters/me/schedule/exceptions` | Date-specific overrides                                          |
| GET                   | `/masters/me/stats`               | Bookings by status, rating, completion rate                      |

All are `@Roles(MASTER)`. Service and schedule mutations additionally require `MasterApprovedGuard` in `PENDING` or `APPROVED` state.

---

## 9. Bookings — `/bookings`

| Method | Path                     | Role                | Description                                     |
| ------ | ------------------------ | ------------------- | ----------------------------------------------- |
| POST   | `/bookings`              | CLIENT              | Create → 201, status `PENDING`                  |
| GET    | `/bookings`              | CLIENT, MASTER      | Own bookings; filters `status`, `from`, `to`    |
| GET    | `/bookings/:id`          | participants, ADMIN | Detail + status history                         |
| POST   | `/bookings/:id/accept`   | MASTER              | `PENDING → ACCEPTED`                            |
| POST   | `/bookings/:id/reject`   | MASTER              | `PENDING → REJECTED`, `{ reason }`              |
| POST   | `/bookings/:id/cancel`   | CLIENT, MASTER      | → `CANCELLED_BY_*`; reason required for masters |
| POST   | `/bookings/:id/start`    | MASTER              | `ACCEPTED → IN_PROGRESS`                        |
| POST   | `/bookings/:id/complete` | MASTER              | `IN_PROGRESS → COMPLETED`                       |

**Create request**

```json
{
  "masterId": "uuid",
  "serviceId": "uuid",
  "scheduledAt": "2026-08-03T09:00:00.000Z",
  "address": {
    "line": "12 Mustaqillik str, apt 4",
    "district": "Yunusabad",
    "latitude": 41.3,
    "longitude": 69.28
  },
  "note": "Bring a 40mm drill bit"
}
```

**Errors:** `404 MASTER_NOT_FOUND`, `409 MASTER_UNAVAILABLE`, `422 SERVICE_INVALID`, `422 SLOT_TOO_SOON`, `409 SLOT_NOT_AVAILABLE`, `409 CLIENT_SLOT_CONFLICT`, `429 TOO_MANY_PENDING_BOOKINGS`, `409 ILLEGAL_BOOKING_TRANSITION`, `409 BOOKING_OVERLAP`, `422 TOO_EARLY_TO_START`.

Field visibility: `client.phone` and `address.line` are present in the master's view only when the status is `ACCEPTED`, `IN_PROGRESS` or `COMPLETED`; otherwise only `address.district` is returned.

---

## 10. Reviews — `/reviews`

| Method | Path                 | Role            | Description                             |
| ------ | -------------------- | --------------- | --------------------------------------- |
| POST   | `/reviews`           | CLIENT          | `{ bookingId, rating, comment? }` → 201 |
| PATCH  | `/reviews/:id`       | CLIENT (author) | Within 24 h                             |
| GET    | `/reviews/me`        | CLIENT          | Own reviews                             |
| GET    | `/reviews/received`  | MASTER          | Reviews about the caller                |
| POST   | `/reviews/:id/reply` | MASTER          | One reply per review                    |

**Errors:** `409 BOOKING_NOT_COMPLETED`, `409 REVIEW_ALREADY_EXISTS`, `409 REVIEW_WINDOW_CLOSED`, `409 REVIEW_EDIT_WINDOW_CLOSED`, `409 REPLY_ALREADY_EXISTS`.

---

## 11. Notifications & Chat

### `/notifications`

| Method | Path                          | Description           |
| ------ | ----------------------------- | --------------------- |
| GET    | `/notifications`              | Paginated, `?isRead=` |
| GET    | `/notifications/unread-count` | `{ count }`           |
| PATCH  | `/notifications/:id/read`     | 204                   |
| PATCH  | `/notifications/read-all`     | 204                   |

### `/conversations` (Phase 5)

| Method | Path                          | Description                                    |
| ------ | ----------------------------- | ---------------------------------------------- |
| POST   | `/conversations`              | `{ participantId }` → existing or new          |
| GET    | `/conversations`              | Ordered by `lastMessageAt`, with unread counts |
| GET    | `/conversations/:id/messages` | Cursor pagination `?cursor=&limit=`            |
| POST   | `/conversations/:id/messages` | `{ body, attachmentKeys? }`                    |
| PATCH  | `/conversations/:id/read`     | 204                                            |
| DELETE | `/messages/:id`               | Sender-side soft delete                        |

Socket.io namespace `/chat`, JWT in the handshake; events `message:new`, `message:read`, `typing`, `error`.

### `/banners`

| Method | Path       | Auth   | Description                            |
| ------ | ---------- | ------ | -------------------------------------- |
| GET    | `/banners` | Public | Currently active banners, `?position=` |

---

## 12. Admin — `/admin`

All routes `@Roles(ADMIN)`; all mutations audited.

**Masters**

| Method | Path                            | Description                                                           |
| ------ | ------------------------------- | --------------------------------------------------------------------- |
| GET    | `/admin/masters`                | Filters: `approvalStatus`, `status`, `cityId`, `categoryId`, `search` |
| GET    | `/admin/masters/:id`            | Full profile incl. certificates and documents                         |
| POST   | `/admin/masters/:id/approve`    | Readiness-checked                                                     |
| POST   | `/admin/masters/:id/reject`     | `{ reason }` (10–500 chars)                                           |
| POST   | `/admin/masters/:id/activate`   |                                                                       |
| POST   | `/admin/masters/:id/deactivate` | `{ reason }`; returns affected booking count                          |

**Clients / users**

| Method | Path                       | Description                         |
| ------ | -------------------------- | ----------------------------------- |
| GET    | `/admin/users`             | Filters: `role`, `status`, `search` |
| GET    | `/admin/users/:id`         |                                     |
| POST   | `/admin/users/:id/block`   | `{ reason }`; revokes all sessions  |
| POST   | `/admin/users/:id/unblock` |                                     |

**Categories**

| Method | Path                    | Description                                      |
| ------ | ----------------------- | ------------------------------------------------ |
| POST   | `/admin/categories`     |                                                  |
| PATCH  | `/admin/categories/:id` | Rename, reparent, reorder, toggle active         |
| DELETE | `/admin/categories/:id` | Fails with `409 CATEGORY_IN_USE` when referenced |

**Bookings**

| Method | Path                         | Description                                             |
| ------ | ---------------------------- | ------------------------------------------------------- |
| GET    | `/admin/bookings`            | Filters: `status`, `masterId`, `clientId`, `from`, `to` |
| GET    | `/admin/bookings/:id`        | Includes full status history                            |
| POST   | `/admin/bookings/:id/cancel` | `{ reason }` → `CANCELLED_BY_ADMIN`                     |

**Reviews**

| Method | Path                        | Description                         |
| ------ | --------------------------- | ----------------------------------- |
| GET    | `/admin/reviews`            | Includes hidden                     |
| POST   | `/admin/reviews/:id/hide`   | `{ reason }`; aggregates recomputed |
| POST   | `/admin/reviews/:id/unhide` |                                     |

**Banners**
`POST|GET|PATCH|DELETE /admin/banners[/:id]`

**Notifications**
`POST /admin/notifications/broadcast` — `{ role? | userIds?, type, payload }`

**Dashboard & audit**

| Method | Path                | Description                                                              |
| ------ | ------------------- | ------------------------------------------------------------------------ |
| GET    | `/admin/dashboard`  | `?from=&to=` aggregate metrics                                           |
| GET    | `/admin/audit-logs` | Filters: `actorUserId`, `action`, `entityType`, `entityId`, `from`, `to` |

**Dashboard response shape**

```json
{
  "users": { "clients": 1240, "masters": 318, "admins": 4, "blocked": 7 },
  "masters": { "pending": 12, "approved": 290, "rejected": 16, "inactive": 9 },
  "bookings": {
    "pending": 33,
    "accepted": 51,
    "inProgress": 4,
    "completed": 892,
    "cancelled": 61,
    "expired": 27
  },
  "rates": { "completionRate": 0.87, "cancellationRate": 0.06, "acceptanceRate": 0.79 },
  "reviews": { "count": 402, "averageRating": 4.62 },
  "topCategories": [{ "categoryId": "…", "name": "Plumbing", "bookings": 210 }],
  "series": [{ "date": "2026-07-01", "created": 22, "completed": 18 }]
}
```

---

## 13. Rate Limits

| Scope                             | Limit                              |
| --------------------------------- | ---------------------------------- |
| Global per IP                     | 100 req / min                      |
| `/auth/login`, `/auth/register/*` | 5 req / 15 min per IP + identifier |
| `/auth/forgot-password`           | 3 req / hour per email             |
| `/auth/refresh`                   | 30 req / hour per user             |
| `/files/presign`                  | 20 req / hour per user             |
| `POST /bookings`                  | 10 req / hour per client           |
| `POST /reviews`                   | 10 req / day per client            |
| Messages                          | 60 req / min per user              |

Exceeding a limit returns `429` with `Retry-After`.

---

## 14. Versioning & Deprecation

- The version lives in the URL: `/api/v1`.
- Additive changes (new optional field, new endpoint) ship within `v1`.
- Breaking changes require `/api/v2` running in parallel.
- A deprecated endpoint returns `Deprecation` and `Sunset` headers for at least 90 days before removal, and is announced in `CHANGELOG.md`.
