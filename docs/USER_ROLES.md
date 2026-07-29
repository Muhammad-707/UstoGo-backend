# User Roles & Permission Matrix — UstoGo

**Version:** 1.0.0
**Last updated:** 2026-07-29
**Enforcement:** `AUTHORIZATION.md` describes the guard implementation. This document is the normative source of _what_ each role may do.

---

## 1. Role Enumeration

```prisma
enum UserRole {
  ADMIN
  CLIENT
  MASTER
}
```

A user holds **exactly one** role, assigned at creation and immutable through the API. There is no role-elevation endpoint.

## 2. Account Status

```prisma
enum UserStatus {
  ACTIVE      // normal operation
  INACTIVE    // deactivated by self or admin; can be reactivated
  BLOCKED     // admin sanction; cannot authenticate, cannot be self-reactivated
}
```

Only `ACTIVE` users may obtain or refresh tokens. A user whose status changes to `INACTIVE` or `BLOCKED` has all refresh tokens revoked immediately; their access token remains valid until expiry (max 15 minutes) — an acceptable and documented window.

## 3. ADMIN

**Creation:** never via HTTP. Created with `npm run cli -- admin:create --email=...`, which prompts for the password and refuses to accept it as an argument — an argv value is visible in `ps`, in shell history and in any CI log that echoes the command (`AUTHENTICATION.md` §5). The registration controller has no admin branch.

**Capabilities**

_Self_

- Log in, log out, refresh session
- Change own password
- View own profile

_Master management_

- List masters with filters (`approvalStatus`, `status`, category, rating, registration date)
- View full master profile including certificates and documents
- Approve a master (`PENDING → APPROVED`)
- Reject a master with a mandatory reason (`PENDING → REJECTED`)
- Activate / deactivate an approved master

_Client management_

- List and view clients
- Block / unblock a client

_Catalogue_

- Full CRUD on categories (create, rename, reparent, reorder, deactivate)
- View all services; deactivate a policy-violating service

_Bookings_

- List and view all bookings, filter by status, master, client, date range
- Read booking status history
- Force-cancel a booking with a mandatory reason (dispute resolution)

_Reviews_

- List all reviews including hidden ones
- Hide / unhide a review with a reason

_Banners_

- Full CRUD, ordering, scheduling (active window), activation toggle

_Notifications_

- Broadcast a system notification to a role or to a specific user

_Dashboard_

- Aggregate metrics: users by role and status, pending master approvals, bookings by status over a period, top categories, average rating, review volume

_Audit_

- Read audit logs with filters

**Explicit prohibitions**

- ❌ Cannot read any password hash or refresh token
- ❌ Cannot impersonate a user or mint tokens for another account
- ❌ Cannot write a review or create a booking
- ❌ Cannot edit the free-text content of a user's review (only hide it)
- ❌ Cannot read chat content outside a flagged dispute; such access is audited (BR-63)

## 4. CLIENT

**Creation:** public self-registration. Immediately `ACTIVE`; no moderation.

**Capabilities**

_Authentication_

- Register, log in, log out, log out of all devices, refresh session
- Request and complete a password reset
- Change own password

_Profile_

- View and edit own profile (first name, last name, phone, avatar, city, default address)
- Upload / replace avatar
- Deactivate own account (soft delete)

_Discovery_

- Search masters by free text, category, city, rating, price range
- Filter by availability on a given date, verified status, has-certificates
- Sort by rating, review count, price, distance (when coordinates are supplied), recency
- View a public master profile: bio, categories, services, schedule, certificates, reviews, aggregate rating
- Browse the category tree
- View active banners

_Bookings_

- Create a booking against a specific master and service for an available slot
- List own bookings with status filters
- View own booking detail including status history
- Cancel own booking while `PENDING` or `ACCEPTED`

_Reviews_

- Create one review per own completed booking
- Edit own review within 24 hours
- View own reviews

_Messaging_

- Open a conversation with a master they share a booking with
- Send and read messages; mark a conversation as read

_Notifications_

- List own notifications, mark one or all as read, read unread count

**Explicit prohibitions**

- ❌ Cannot view another client's data of any kind
- ❌ Cannot review a master without a `COMPLETED` booking with them
- ❌ Cannot change a booking's status to anything other than `CANCELLED_BY_CLIENT`
- ❌ Cannot see a master whose `approvalStatus ≠ APPROVED` or whose account is not `ACTIVE`

## 5. MASTER

**Creation:** public self-registration → `approvalStatus = PENDING` → admin decision.

**Capabilities**

_Authentication_ — identical to CLIENT.

_Profile_

- View and edit own profile: display name, bio, years of experience, city, service radius, phone, timezone
- Upload / replace avatar
- Upload, list and delete certificates (file + title + issuer + issue date)
- Submit profile for review; resubmit after rejection
- Deactivate own account

_Professional configuration_

- Attach and detach leaf categories
- Full CRUD on own services (title, description, category, price, price type, duration)
- Define weekly working days (weekday, start, end)
- Create schedule exceptions (day off, or an altered window for a specific date)

_Bookings_

- List own incoming bookings with status filters
- View booking detail including client contact details **only once the booking is `ACCEPTED`**
- Accept a `PENDING` booking
- Reject a `PENDING` booking with a reason
- Cancel an `ACCEPTED` booking with a reason
- Mark `ACCEPTED → IN_PROGRESS` and `IN_PROGRESS → COMPLETED`

_Reviews_

- View reviews written about them
- Post one public reply per review

_Messaging_ — mirror of CLIENT.

_Notifications_ — mirror of CLIENT.

**Explicit prohibitions**

- ❌ Cannot self-approve or alter `approvalStatus`
- ❌ Cannot create a booking
- ❌ Cannot write a review
- ❌ Cannot see or modify another master's services, schedule or bookings
- ❌ Cannot see client contact details on a `PENDING` booking
- ❌ Cannot delete or edit a review written about them

## 6. Permission Matrix

Legend: ✅ allowed · ⛔ forbidden · 🔒 allowed only for resources the actor owns · ⚠️ conditional (see note)

| Capability                     | ADMIN  | CLIENT | MASTER |
| ------------------------------ | :----: | :----: | :----: |
| Register via public endpoint   |   ⛔   |   ✅   |   ✅   |
| Log in / refresh / log out     |   ✅   |   ✅   |   ✅   |
| Change own password            |   ✅   |   ✅   |   ✅   |
| Edit own profile               |   ✅   |   🔒   |   🔒   |
| Upload avatar                  |   ✅   |   🔒   |   🔒   |
| Upload certificates            |   ⛔   |   ⛔   |   🔒   |
| Browse categories              |   ✅   |   ✅   |   ✅   |
| Manage categories              |   ✅   |   ⛔   |   ⛔   |
| Search masters                 |   ✅   |   ✅   |   ✅   |
| View unapproved master profile |   ✅   |   ⛔   |   🔒   |
| Approve / reject master        |   ✅   |   ⛔   |   ⛔   |
| Activate / deactivate master   |   ✅   |   ⛔   |   ⛔   |
| Create service                 |   ⛔   |   ⛔   | 🔒 ⚠️¹ |
| Manage own schedule            |   ⛔   |   ⛔   |   🔒   |
| Create booking                 |   ⛔   |   ✅   |   ⛔   |
| Accept / reject booking        |   ⛔   |   ⛔   |   🔒   |
| Start / complete booking       |   ⛔   |   ⛔   |   🔒   |
| Cancel booking                 | ✅ ⚠️² |   🔒   |   🔒   |
| View any booking               |   ✅   |   🔒   |   🔒   |
| Write review                   |   ⛔   | 🔒 ⚠️³ |   ⛔   |
| Reply to review                |   ⛔   |   ⛔   |   🔒   |
| Hide review                    |   ✅   |   ⛔   |   ⛔   |
| Send message                   |   ⛔   | 🔒 ⚠️⁴ | 🔒 ⚠️⁴ |
| Read conversation content      |  ⚠️⁵   |   🔒   |   🔒   |
| Manage banners                 |   ✅   |   ⛔   |   ⛔   |
| Read own notifications         |   ✅   |   🔒   |   🔒   |
| Broadcast notification         |   ✅   |   ⛔   |   ⛔   |
| View dashboard metrics         |   ✅   |   ⛔   |   ⛔   |
| Read audit log                 |   ✅   |   ⛔   |   ⛔   |

Notes

1. Only when `approvalStatus ∈ {PENDING, APPROVED}`; a `REJECTED` master must resubmit first.
2. Admin force-cancel is a dispute-resolution action and requires a reason (BR-81 audit applies).
3. Only against own `COMPLETED` booking, within 30 days, once (BR-50/51/52).
4. Only within a conversation the actor is a participant of, and only if BR-61 is satisfied.
5. Admin read is restricted to flagged disputes and is audited (BR-63).

## 7. Mapping to Guards

| Rule class                            | Enforced by                                                       |
| ------------------------------------- | ----------------------------------------------------------------- |
| Is the caller authenticated?          | `JwtAuthGuard` (global, opt-out via `@Public()`)                  |
| Does the caller hold an allowed role? | `RolesGuard` + `@Roles(UserRole.MASTER)`                          |
| Is the master approved?               | `MasterApprovedGuard`                                             |
| Does the caller own this resource?    | Ownership check inside the service layer, never in the controller |
| Is this state transition legal?       | `BookingStateMachine` domain service                              |

Rationale for ownership checks living in the service layer is given in `AUTHORIZATION.md` §5.
