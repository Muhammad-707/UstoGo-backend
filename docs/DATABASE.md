# Database Design — UstoGo

**Version:** 1.0.0
**Engine:** PostgreSQL 16 · **ORM:** Prisma 6
**Last updated:** 2026-07-29

This document is the authoritative data model. `prisma/schema.prisma` must match it exactly; any divergence is a defect.

---

## 1. Conventions

| Convention    | Rule                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Primary key   | `id String @id @default(uuid()) @db.Uuid` on every table                                                                               |
| Timestamps    | `createdAt`, `updatedAt` on every table; `deletedAt` on every business entity                                                          |
| Time type     | `@db.Timestamptz(3)`, always stored in UTC                                                                                             |
| Money         | `Decimal @db.Decimal(12,2)` — never `Float`                                                                                            |
| Table naming  | snake_case plural via `@@map` (`user_profiles`); Prisma models are PascalCase singular                                                 |
| Column naming | snake_case via `@map`; Prisma fields are camelCase                                                                                     |
| Enums         | Uppercase SNAKE_CASE values, defined in the schema, mapped to native PostgreSQL enums                                                  |
| Deletion      | Soft delete (`deletedAt`) for business entities; hard delete only for join rows, expired tokens and notifications older than retention |
| Foreign keys  | Always explicit, always indexed; `onDelete: Restrict` by default, `Cascade` only for owned children                                    |
| Uniqueness    | Partial unique indexes are used where uniqueness applies only to live rows                                                             |

### Soft delete enforcement

A Prisma client extension rewrites every read on a soft-deletable model to append `deletedAt: null`: `findUnique`, `findUniqueOrThrow`, `findFirst`, `findFirstOrThrow`, `findMany`, `count`, `aggregate` and `groupBy`. `aggregate` and `groupBy` are included for the same reason `count` is — a total that silently includes deleted rows is a wrong answer, not a partial one. `findUnique` is included because Prisma 5 onwards accepts non-unique filters alongside the unique field, without which lookup by id would be the one path that still returned deleted rows.

Writes are deliberately **not** rewritten: soft-deleting is itself an `update`, and restoring a row would be impossible if updates could not see it.

Admin queries that need deleted rows pass an explicit `deletedAt` filter — an explicit filter always wins over the injected one — which is the seam the repository's `withDeleted()` variants use. `PrismaService.db` is the filtered client and is what application code uses; the unfiltered client is `PrismaService` itself, so bypassing soft delete is something you have to name rather than something you get by accident.

Centralised in `src/prisma/extensions/soft-delete.extension.ts` — no service filters `deletedAt` by hand.

---

## 2. Enumerations

```prisma
enum UserRole        { ADMIN CLIENT MASTER }
enum UserStatus      { ACTIVE INACTIVE BLOCKED }
enum ApprovalStatus  { PENDING APPROVED REJECTED }
enum PriceType       { FIXED HOURLY FROM }

enum BookingStatus {
  PENDING
  ACCEPTED
  IN_PROGRESS
  COMPLETED
  REJECTED
  EXPIRED
  CANCELLED_BY_CLIENT
  CANCELLED_BY_MASTER
  CANCELLED_BY_ADMIN
}

enum ActorType { CLIENT MASTER ADMIN SYSTEM }

enum NotificationType {
  BOOKING_CREATED
  BOOKING_ACCEPTED
  BOOKING_REJECTED
  BOOKING_STARTED
  BOOKING_COMPLETED
  BOOKING_CANCELLED
  BOOKING_EXPIRED
  MASTER_APPROVED
  MASTER_REJECTED
  MASTER_DEACTIVATED
  REVIEW_RECEIVED
  REVIEW_REPLIED
  REVIEW_INVITATION
  MESSAGE_RECEIVED
  SYSTEM_ANNOUNCEMENT
}

enum ReviewStatus  { VISIBLE HIDDEN }
enum BannerPosition{ HOME_TOP HOME_MIDDLE CATEGORY_TOP }
enum FilePurpose   { AVATAR CERTIFICATE BANNER MESSAGE_ATTACHMENT CATEGORY_ICON }
enum AuditAction {
  MASTER_APPROVED MASTER_REJECTED MASTER_ACTIVATED MASTER_DEACTIVATED
  USER_BLOCKED USER_UNBLOCKED
  CATEGORY_CREATED CATEGORY_UPDATED CATEGORY_DEACTIVATED
  SERVICE_DEACTIVATED
  BOOKING_FORCE_CANCELLED
  REVIEW_HIDDEN REVIEW_UNHIDDEN
  BANNER_CREATED BANNER_UPDATED BANNER_DELETED
  NOTIFICATION_BROADCAST
  CONVERSATION_ACCESSED
}
```

---

## 3. Identity

### 3.1 `User`

| Column                                  | Type         | Constraints                                   | Notes                                                      |
| --------------------------------------- | ------------ | --------------------------------------------- | ---------------------------------------------------------- |
| `id`                                    | uuid         | PK                                            |                                                            |
| `email`                                 | citext       | unique where `deletedAt IS NULL`              | normalised lowercase                                       |
| `phone`                                 | varchar(20)  | unique where not null and `deletedAt IS NULL` | E.164                                                      |
| `passwordHash`                          | varchar(72)  | not null                                      | bcrypt; **never selected into DTOs**                       |
| `role`                                  | `UserRole`   | not null, immutable                           |                                                            |
| `status`                                | `UserStatus` | default `ACTIVE`                              |                                                            |
| `emailVerifiedAt`                       | timestamptz  | null                                          | Phase 6                                                    |
| `totpSecret`                            | varchar(255) | null                                          | Phase 6; AES-256-GCM ciphertext, never plaintext or logged |
| `totpEnabledAt`                         | timestamptz  | null                                          | Phase 6; gates whether login requires a TOTP challenge     |
| `lastLoginAt`                           | timestamptz  | null                                          |                                                            |
| `createdAt` / `updatedAt` / `deletedAt` | timestamptz  |                                               |                                                            |

Indexes: `(role, status)`, `(createdAt)`, partial unique on `email`, partial unique on `phone`.

Invariants

- A user has at most one `ClientProfile` **or** one `MasterProfile`, matching `role`. Enforced by the application plus a database `CHECK` in a migration guard.
- `passwordHash` is excluded from the default Prisma selection through a repository-level `select` — no DTO ever maps it.

### 3.2 `ClientProfile`

`id`, `userId` (unique FK → User, cascade), `firstName`, `lastName`, `cityId?`, `avatarFileId?`, `defaultAddress?` (varchar 500), timestamps, `deletedAt`.
Index: `(cityId)`.

### 3.3 `MasterProfile`

| Column                           | Type             | Notes                              |
| -------------------------------- | ---------------- | ---------------------------------- |
| `id`                             | uuid             | PK                                 |
| `userId`                         | uuid             | unique FK → User, cascade          |
| `firstName`, `lastName`          | varchar(100)     |                                    |
| `displayName`                    | varchar(150)     | shown publicly                     |
| `bio`                            | text             | ≤ 2000 chars, validated at the DTO |
| `yearsOfExperience`              | smallint         | 0–70                               |
| `cityId`                         | uuid             | FK → City                          |
| `serviceRadiusKm`                | smallint         | default 15                         |
| `timezone`                       | varchar(64)      | IANA, e.g. `Asia/Tashkent`         |
| `avatarFileId`                   | uuid             | FK → File                          |
| `approvalStatus`                 | `ApprovalStatus` | default `PENDING`                  |
| `rejectionReason`                | varchar(500)     | set on rejection                   |
| `approvedAt`, `approvedByUserId` |                  | audit trail                        |
| `isActive`                       | boolean          | default `false`                    |
| `ratingAverage`                  | Decimal(3,2)     | default `0.00`, denormalised       |
| `ratingCount`                    | integer          | default `0`, denormalised          |
| `completedBookingsCount`         | integer          | default `0`, denormalised          |
| `searchVector`                   | tsvector         | generated, GIN-indexed             |
| timestamps + `deletedAt`         |                  |                                    |

Indexes: `(approvalStatus, isActive)`, `(cityId)`, `(ratingAverage DESC)`, GIN on `searchVector`.

**Denormalisation contract:** `ratingAverage`, `ratingCount` and `completedBookingsCount` are only ever written inside the transaction that causes the change (review write/edit/hide, booking completion). A nightly reconciliation job recomputes them and logs any drift as an error — drift indicates a bug, not a tolerable condition.

### 3.4 `Certificate`

`id`, `masterProfileId` (FK → MasterProfile, cascade, indexed), `fileId` (FK → File, restrict), `title` (varchar 200), `issuedBy?` (varchar 200), `issuedAt?` (date), `verifiedAt?` (timestamptz), `verifiedByUserId?` (FK → User), timestamps, `deletedAt`.

Index: `(masterProfileId, deletedAt)`.
Deletion is soft — a certificate referenced by a past moderation decision must remain reconstructable. `verifiedAt` is unused in v1 (manual review only) and exists so automated verification (backlog B-10) is an additive change.

### 3.5 `City`

`id`, `name` (unique), `slug` (unique), `region?`, `latitude?`, `longitude?`, `isActive`, timestamps. Seeded reference data.

---

## 4. Sessions and Tokens

### 4.1 `RefreshToken`

| Column                               | Type         | Notes                                                                                                   |
| ------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------- |
| `id`                                 | uuid         | PK                                                                                                      |
| `userId`                             | uuid         | FK → User, cascade, indexed                                                                             |
| `tokenHash`                          | varchar(128) | **unique**, SHA-256 of the raw token                                                                    |
| `familyId`                           | uuid         | rotation lineage, indexed                                                                               |
| `expiresAt`                          | timestamptz  |                                                                                                         |
| `usedAt`                             | timestamptz  | set when consumed → reuse detection                                                                     |
| `revokedAt`                          | timestamptz  |                                                                                                         |
| `revokedReason`                      | varchar(100) | `LOGOUT`, `ROTATION`, `REUSE_DETECTED`, `PASSWORD_CHANGED`, `ADMIN_ACTION`, `SESSION_REVOKED` (Phase 6) |
| `deviceId`, `userAgent`, `ipAddress` |              | forensic context; also what `GET /auth/sessions` (Phase 6) lists per device                             |
| `createdAt`                          | timestamptz  |                                                                                                         |

Indexes: `(userId, revokedAt)`, `(familyId)`, `(expiresAt)` for the cleanup job.
Hard-deleted by a nightly job once `expiresAt < now() - 30 days`.

### 4.2 `PasswordResetToken`

`id`, `userId` (FK, cascade), `tokenHash` (unique), `expiresAt`, `usedAt?`, `createdAt`. Only the hash is stored; the raw token exists only in the outbound email.

### 4.3 `EmailVerificationToken` (Phase 6)

`id`, `userId` (FK, cascade), `tokenHash` (unique), `expiresAt`, `usedAt?`, `createdAt`. Same shape and the same reasoning as `PasswordResetToken`: only the hash is stored, the raw token exists only in the outbound email, and issuing a new one invalidates any still-outstanding token. Sets `User.emailVerifiedAt` on consumption; nothing else in v1 is gated on that column.

### 4.4 `TwoFactorChallenge` (Phase 6)

`id`, `userId` (FK, cascade), `tokenHash` (unique), `expiresAt` (5 min), `usedAt?`, `createdAt`. Issued after a password verifies for an account with `User.totpEnabledAt` set; exchanged, together with a TOTP code, for a real session at `POST /auth/2fa/verify`. `User.totpSecret` (§3.1) is AES-256-GCM ciphertext, not a hash — a TOTP code has to be verified by recomputing HOTP against the plaintext secret, unlike every other token in this schema, which only ever needs a one-way comparison.

---

## 5. Catalogue

### 5.1 `Category`

`id`, `parentId?` (self FK, `onDelete: Restrict`), `slug` (unique, immutable), `name` (varchar 150), `description?`, `iconFileId?`, `depth` (smallint 1–3), `sortOrder` (int), `isActive` (bool), timestamps, `deletedAt`.

Indexes: `(parentId, sortOrder)`, `(isActive)`, unique `(slug)`.

Rules

- `depth = parent.depth + 1`, maximum 3 (BR-20)
- A category is a **leaf** when it has no active children; only leaves accept services (BR-20)
- Reparenting recomputes `depth` for the whole subtree in one transaction

### 5.2 `MasterCategory` (join)

`id`, `masterProfileId`, `categoryId`, `createdAt`. Unique `(masterProfileId, categoryId)`. Hard-deletable.

### 5.3 `Service`

| Column                   | Type          | Notes                         |
| ------------------------ | ------------- | ----------------------------- |
| `id`                     | uuid          | PK                            |
| `masterProfileId`        | uuid          | FK, cascade, indexed          |
| `categoryId`             | uuid          | FK → leaf Category, restrict  |
| `title`                  | varchar(200)  |                               |
| `description`            | text          | ≤ 2000                        |
| `priceType`              | `PriceType`   |                               |
| `price`                  | Decimal(12,2) | `> 0` (CHECK)                 |
| `currency`               | char(3)       | ISO-4217, deployment-constant |
| `durationMinutes`        | integer       | CHECK 15–1440 and `% 15 = 0`  |
| `isActive`               | boolean       | default `true`                |
| timestamps + `deletedAt` |               |                               |

Indexes: `(masterProfileId, isActive)`, `(categoryId, isActive)`, `(price)`.

---

## 6. Availability

### 6.1 `WorkingDay`

`id`, `masterProfileId` (FK, cascade), `weekday` (smallint 0=Sunday…6), `startTime` (time), `endTime` (time), `createdAt`, `updatedAt`.
CHECK `endTime > startTime`. Index `(masterProfileId, weekday)`.
Overlap within a weekday is rejected at the service layer (`SCHEDULE_OVERLAP`); the whole weekly set is replaced atomically on `PUT`.

### 6.2 `ScheduleException`

`id`, `masterProfileId` (FK, cascade), `date` (date), `isDayOff` (bool), `startTime?`, `endTime?`, `note?`, timestamps.
Unique `(masterProfileId, date)`. CHECK: if `isDayOff = false` then both times are non-null and `endTime > startTime`.

---

## 7. Bookings

### 7.1 `Booking`

| Column                                                  | Type            | Notes                                                                |
| ------------------------------------------------------- | --------------- | -------------------------------------------------------------------- |
| `id`                                                    | uuid            | PK                                                                   |
| `bookingNumber`                                         | varchar(20)     | unique, human-readable (`UG-2026-000123`), generated from a sequence |
| `clientProfileId`                                       | uuid            | FK, restrict, indexed                                                |
| `masterProfileId`                                       | uuid            | FK, restrict, indexed                                                |
| `serviceId`                                             | uuid            | FK, restrict                                                         |
| `status`                                                | `BookingStatus` | default `PENDING`                                                    |
| `scheduledAt`                                           | timestamptz     | slot start, UTC                                                      |
| `endsAt`                                                | timestamptz     | `scheduledAt + durationMinutes`, stored for range queries            |
| `durationMinutes`                                       | integer         | snapshot                                                             |
| `serviceTitle`                                          | varchar(200)    | **snapshot** — survives service edits/deletes                        |
| `price`                                                 | Decimal(12,2)   | snapshot                                                             |
| `priceType`                                             | `PriceType`     | snapshot                                                             |
| `currency`                                              | char(3)         | snapshot                                                             |
| `addressLine`                                           | varchar(500)    | full address                                                         |
| `addressDistrict`                                       | varchar(150)    | shown to the master before acceptance                                |
| `latitude`, `longitude`                                 | Decimal(9,6)    | optional                                                             |
| `clientNote`                                            | text            | ≤ 1000                                                               |
| `acceptedAt`, `startedAt`, `completedAt`, `cancelledAt` | timestamptz     |                                                                      |
| `cancellationReason`                                    | varchar(500)    |                                                                      |
| `cancelledByType`                                       | `ActorType`     |                                                                      |
| `isLateCancellation`                                    | boolean         | default `false`                                                      |
| timestamps + `deletedAt`                                |                 |                                                                      |

Indexes

- `(masterProfileId, status, scheduledAt)` — master inbox and overlap checks
- `(clientProfileId, status, scheduledAt)` — client list
- `(status, scheduledAt)` — expiry job
- `(scheduledAt)`, `(createdAt)` — reporting
- Unique `(bookingNumber)`

**Overlap prevention.** In addition to the serializable transaction at acceptance, a PostgreSQL exclusion constraint is added by migration:

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
EXCLUDE USING gist (
  master_profile_id WITH =,
  tstzrange(scheduled_at, ends_at) WITH &&
) WHERE (status IN ('ACCEPTED','IN_PROGRESS') AND deleted_at IS NULL);
```

This makes double-booking impossible at the storage layer regardless of application bugs — the single most important integrity guarantee in the system. Requires the `btree_gist` extension.

### 7.2 `BookingStatusHistory` (append-only)

`id`, `bookingId` (FK, cascade, indexed), `fromStatus?`, `toStatus`, `actorType`, `actorUserId?`, `reason?` (varchar 500), `createdAt`.
No `updatedAt`, no `deletedAt` — this table is written once and never modified. Index `(bookingId, createdAt)`.

---

## 8. Reviews

### 8.1 `Review`

`id`, `bookingId` (**unique** FK — enforces one review per booking, BR-51), `clientProfileId` (FK), `masterProfileId` (FK, indexed), `rating` (smallint, CHECK 1–5), `comment?` (varchar 2000), `status` (`ReviewStatus`, default `VISIBLE`), `hiddenReason?`, `hiddenByUserId?`, `hiddenAt?`, `editedAt?`, timestamps, `deletedAt`.
Indexes: `(masterProfileId, status, createdAt DESC)`, `(rating)`.

### 8.2 `ReviewReply`

`id`, `reviewId` (**unique** FK, cascade), `masterProfileId` (FK), `body` (varchar 2000), timestamps, `deletedAt`.

---

## 9. Messaging

### 9.1 `Conversation`

`id`, `clientProfileId` (FK), `masterProfileId` (FK), `lastMessageAt?`, `lastMessagePreview?` (varchar 200), timestamps, `deletedAt`.
Unique `(clientProfileId, masterProfileId)` (BR-60). Indexes `(clientProfileId, lastMessageAt DESC)`, `(masterProfileId, lastMessageAt DESC)`.

### 9.2 `Message`

`id`, `conversationId` (FK, cascade, indexed), `senderUserId` (FK), `body` (varchar 4000), `readAt?`, timestamps, `deletedAt`.
Index `(conversationId, createdAt DESC)` — backs cursor pagination.

### 9.3 `MessageAttachment`

`id`, `messageId` (FK, cascade), `fileId` (FK), `createdAt`.

---

## 10. Notifications

### `Notification`

`id`, `userId` (FK, cascade, indexed), `type` (`NotificationType`), `payload` (jsonb), `isRead` (bool, default false), `readAt?`, `createdAt`.
Indexes: `(userId, isRead, createdAt DESC)`, `(createdAt)` for retention pruning.
No `updatedAt`/`deletedAt`; rows older than 180 days are hard-deleted by a retention job.
`payload` holds only identifiers and display primitives — never full entities, never PII beyond a display name.

---

## 11. Files

### `File`

`id`, `key` (varchar 500, unique — the object storage key), `bucket`, `mimeType`, `sizeBytes` (bigint), `purpose` (`FilePurpose`), `uploadedByUserId?` (FK), `isConfirmed` (bool, default false), `createdAt`, `deletedAt`.

Lifecycle: presign → row created with `isConfirmed = false` → the client uploads → the server HEADs the object, verifies MIME and size, sets `isConfirmed = true`. A nightly job hard-deletes unconfirmed rows and their objects after 24 hours.

---

## 12. Banners

### `Banner`

`id`, `title` (varchar 200), `subtitle?`, `imageFileId` (FK), `linkUrl?` (varchar 500), `position` (`BannerPosition`), `sortOrder` (int), `startsAt?`, `endsAt?`, `isActive` (bool), `createdByUserId`, timestamps, `deletedAt`.
Index `(position, isActive, sortOrder)`. Public reads filter `isActive AND (startsAt IS NULL OR startsAt <= now()) AND (endsAt IS NULL OR endsAt >= now())`.

---

## 13. Audit

### `AuditLog` (append-only)

`id`, `actorUserId` (FK, restrict, indexed), `action` (`AuditAction`), `entityType` (varchar 60), `entityId` (uuid), `before` (jsonb?), `after` (jsonb?), `reason?` (varchar 500), `ipAddress?`, `userAgent?`, `createdAt`.
Indexes: `(actorUserId, createdAt DESC)`, `(entityType, entityId)`, `(action, createdAt DESC)`.
No update or delete path exists in code. Sensitive fields (`passwordHash`, `tokenHash`) are stripped from the diffs by the audit interceptor's redaction list.

---

## 14. Relationship Summary

```
User 1─1 ClientProfile        User 1─1 MasterProfile        User 1─* RefreshToken
User 1─* Notification         User 1─* AuditLog (as actor)  User 1─* Message (as sender)

MasterProfile *─* Category   (via MasterCategory)
MasterProfile 1─* Service     Service *─1 Category (leaf)
MasterProfile 1─* WorkingDay  MasterProfile 1─* ScheduleException
MasterProfile 1─* Certificate MasterProfile 1─* Booking
MasterProfile 1─* Review      MasterProfile 1─* ReviewReply

ClientProfile 1─* Booking     ClientProfile 1─* Review

Booking 1─1 Review            Booking 1─* BookingStatusHistory
Review  1─1 ReviewReply

Conversation 1─* Message      Message 1─* MessageAttachment
File 1─* (avatar | certificate | banner | attachment | category icon)
Category 1─* Category (self, max depth 3)
```

Rendered diagram: `ERD.md`.

---

## 15. Migration Policy

1. Every schema change ships as a Prisma migration; `prisma db push` is forbidden outside local prototyping.
2. Migrations are **expand/contract**: add nullable → backfill → switch reads → make non-nullable → drop old, across separate releases. No release requires downtime (NFR-A-3).
3. Destructive migrations (drop column, drop table, narrow a type) require explicit sign-off recorded in `CHANGELOG.md`.
4. Migration names are descriptive: `20260729_add_booking_overlap_exclusion`.
5. Raw SQL blocks are permitted for exclusion constraints, partial indexes, generated columns and extensions — features Prisma cannot express.
6. Required extensions: `citext`, `btree_gist`, `pg_trgm`.

## 16. Performance Notes

| Query                                          | Supporting index                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Master search by category + city + rating sort | `(approvalStatus, isActive)`, `(cityId)`, `(ratingAverage DESC)`; free text via GIN on `searchVector` |
| Master booking inbox                           | `(masterProfileId, status, scheduledAt)`                                                              |
| Client booking list                            | `(clientProfileId, status, scheduledAt)`                                                              |
| Availability overlap check                     | `(masterProfileId, status, scheduledAt)` + the GiST exclusion constraint                              |
| Expiry job scan                                | `(status, scheduledAt)`                                                                               |
| Review listing                                 | `(masterProfileId, status, createdAt DESC)`                                                           |
| Notification list                              | `(userId, isRead, createdAt DESC)`                                                                    |
| Message pagination                             | `(conversationId, createdAt DESC)`                                                                    |

Every list endpoint uses keyset or offset pagination with a hard `limit` cap of 100 (FR-X-1). Aggregate counts on large tables use estimated counts where exactness is not required by the product.
