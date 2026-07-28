# Modules — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

Every module declares: responsibility, public surface (what it exports), dependencies, invariants it owns, and what it must never do. The "never" column is what keeps boundaries from eroding.

---

## Infrastructure Modules

### `ConfigModule` (global)
**Responsibility** Parse and validate environment variables once at boot into a typed, frozen object.
**Exports** `AppConfigService`
**Depends on** nothing
**Invariants** The process exits before binding a port if configuration is invalid.
**Never** Read `process.env` anywhere else in the codebase.

### `PrismaModule` (global)
**Responsibility** Own the `PrismaClient` lifecycle, soft-delete extension, transaction manager, query logging.
**Exports** `PrismaService`, `TransactionManager`
**Depends on** `ConfigModule`
**Invariants** Soft-deleted rows never appear in a default read; graceful shutdown drains the pool.
**Never** Contain business logic.

### `LoggerModule` (global)
**Responsibility** Structured JSON logging with request correlation and a central redaction list.
**Exports** `AppLogger`
**Never** Log a secret, token or full request body.

### `CommonModule`
**Responsibility** Cross-cutting HTTP concerns: `ValidationPipe`, `GlobalExceptionFilter`, `ClassSerializerInterceptor`, `AuditInterceptor`, `@CurrentUser()`, `@Roles()`, `@Public()`, base exceptions, pagination helpers, custom validators.
**Exports** everything above
**Never** Depend on a feature module. (This is the rule that keeps `CommonModule` from becoming a junk drawer.)

### `HealthModule`
**Responsibility** `/health` and `/health/ready`.
**Depends on** `PrismaModule`, `StorageModule`

### `MailModule`
**Responsibility** Transactional email behind a `MailProvider` interface; queued with retry.
**Exports** `MailService`
**Invariants** Email failures never fail the originating request.

---

## Core Feature Modules

### `AuthModule` — F-01
**Responsibility** Registration, login, token issuance and rotation, logout, password reset and change.
**Exports** `JwtAuthGuard`, `RolesGuard`, `AuthService`
**Depends on** `UsersModule`, `MastersModule` (master registration), `MailModule`, `PrismaModule`, `ConfigModule`
**Owns** `RefreshToken`, `PasswordResetToken`
**Invariants**
- No code path creates an `ADMIN`
- Refresh tokens are stored hashed and rotate on every use
- Reuse of a consumed token revokes the family
- Login responses are indistinguishable between unknown email and wrong password
**Never** Return a password hash; log a raw token; expose a role-assignment parameter.

### `UsersModule` — F-02
**Responsibility** `User` and `ClientProfile` lifecycle; own-profile read and update; account deactivation; city reference data.
**Exports** `UsersService`, `UsersRepository`
**Depends on** `PrismaModule`, `FilesModule`
**Owns** `User`, `ClientProfile`, `City`
**Invariants** Email and phone uniqueness among live rows; `passwordHash` is excluded from every projection.
**Never** Issue tokens (that is `AuthModule`); expose another user's contact details.

### `FilesModule` — F-13
**Responsibility** Presigned upload and read URLs, post-upload verification, orphan cleanup.
**Exports** `FilesService`, `StorageProvider` token
**Owns** `File`
**Invariants** A file is usable only after server-side confirmation of its real MIME type and size.
**Never** Stream binaries through the API process.

### `CategoriesModule` — F-05
**Responsibility** Category tree: public read, admin CRUD, depth and leaf rules.
**Exports** `CategoriesService`
**Owns** `Category`
**Invariants** Depth ≤ 3; only leaves accept services; slug unique and immutable; in-use categories cannot be deleted.
**Never** Allow a non-admin mutation.

### `MastersModule` — F-03, F-04
**Responsibility** `MasterProfile` lifecycle, category attachment, certificates, public profile projection, moderation transitions, rating aggregates.
**Exports** `MastersService`, `MastersRepository`, `MasterApprovedGuard`
**Depends on** `UsersModule`, `CategoriesModule`, `FilesModule`, `AuditModule`
**Owns** `MasterProfile`, `MasterCategory`, `Certificate`
**Invariants**
- New masters are `PENDING` and invisible publicly
- Approval requires ≥1 category and ≥1 active service
- Only admins change `approvalStatus`; every change is audited and notified
- `ratingAverage`/`ratingCount` are written only inside the transaction that changes them
**Never** Let a master self-approve; expose `rejectionReason` publicly.

### `ServicesModule` — F-06
**Responsibility** Master-scoped service CRUD.
**Exports** `ServicesService`
**Depends on** `MastersModule`, `CategoriesModule`
**Owns** `Service`
**Invariants** Category must be a leaf and attached to the master; price > 0; duration is a multiple of 15 in [15, 1440]; delete is soft and never mutates existing bookings.

### `ScheduleModule` — F-07
**Responsibility** Weekly availability, date exceptions, free-slot computation.
**Exports** `ScheduleService`, `AvailabilityCalculator`
**Depends on** `MastersModule`, `BookingsModule` (read-only, for busy intervals)
**Owns** `WorkingDay`, `ScheduleException`
**Invariants** No overlapping ranges within a weekday; one exception per date; slot computation is timezone-correct and returns UTC.
**Never** Mutate bookings. `AvailabilityCalculator` is a pure function of (rules, exceptions, busy intervals, now) — which is why it is trivially unit-testable.

### `SearchModule` — F-08
**Responsibility** Master discovery: full-text, filtering, sorting, pagination.
**Exports** `SearchService`
**Depends on** `MastersModule`, `ServicesModule`, `ScheduleModule`
**Owns** nothing (read-only projections)
**Invariants** Only approved, active, non-deleted masters are returned; no private contact detail is ever in a search result.
**Never** Write to the database.

### `BookingsModule` — F-09
**Responsibility** Booking creation, the state machine, status history, expiry job.
**Exports** `BookingsService`, `BookingsRepository`, `BookingStateMachine`
**Depends on** `MastersModule`, `ServicesModule`, `ScheduleModule`, `UsersModule`
**Owns** `Booking`, `BookingStatusHistory`
**Invariants**
- Only transitions in the single authoritative table are permitted
- Acceptance is serializable and cannot produce overlapping accepted bookings
- Every transition appends immutable history
- The service snapshot (title, price, duration) is frozen at creation
- Client contact details are disclosed only from `ACCEPTED` onward
**Never** Send notifications directly — it emits events.

### `ReviewsModule` — F-10
**Responsibility** Booking-gated reviews, replies, moderation, rating recomputation.
**Exports** `ReviewsService`
**Depends on** `BookingsModule`, `MastersModule`
**Owns** `Review`, `ReviewReply`
**Invariants** One review per completed booking, within 30 days; 24-hour edit window; one reply per review; aggregates recomputed transactionally on create, edit, hide and unhide.

### `NotificationsModule` — F-11
**Responsibility** Persist and serve typed notifications; listen to domain events.
**Exports** `NotificationsService`
**Depends on** `PrismaModule` and event listeners only
**Owns** `Notification`
**Invariants** Strictly scoped to the recipient — no admin override; payloads carry codes and identifiers, never rendered prose or excess PII.
**Never** Be imported by `BookingsModule`. The dependency runs the other way, through events.

### `ChatModule` — F-12 (Phase 5)
**Responsibility** Conversations, messages, read state, Socket.io gateway.
**Depends on** `BookingsModule` (to verify a shared booking), `FilesModule`
**Owns** `Conversation`, `Message`, `MessageAttachment`
**Invariants** One conversation per (client, master); creation requires a shared non-expired booking; messages immutable after send; admin reads are audited.

### `BannersModule` — F-14
**Responsibility** Admin banner CRUD, public active-window read.
**Owns** `Banner`

### `AuditModule` — F-16
**Responsibility** Append-only audit records, written by an interceptor.
**Exports** `AuditService`, `AuditInterceptor`
**Owns** `AuditLog`
**Invariants** Append-only in code and in database grants; sensitive fields redacted from diffs.
**Never** Expose an update or delete path.

### `AdminModule` — F-15
**Responsibility** Aggregate admin controllers and dashboard metrics. It is a **composition** module: it owns dashboard queries, and otherwise delegates to feature services.
**Depends on** every feature module
**Owns** nothing
**Never** Contain business logic that belongs to a feature. If an admin operation needs a rule, the rule lives in the owning module and admin calls it.

---

## Dependency Rules

1. A feature module may depend only on modules **below** it in the graph of `ARCHITECTURE.md` §4.
2. Cycles are forbidden and fail the build.
3. A module exposes only its `services/` and `guards/` — repositories are internal unless a sibling genuinely needs the query surface.
4. Cross-feature side effects go through domain events.
5. `CommonModule` never imports a feature module.
6. `AdminModule` sits at the top and is imported by nobody.

## Module Checklist (new module)

- [ ] Single, one-sentence responsibility
- [ ] `README.md` stating responsibility, exports, invariants, and non-goals
- [ ] Only the intended providers appear in `exports`
- [ ] No cycle introduced (`npm run lint` proves it)
- [ ] Invariants are enforced in services, and in database constraints where expressible
- [ ] Side effects emitted as events, not direct calls into peer features
- [ ] Documented in this file and in `FEATURES.md`
