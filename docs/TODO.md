# TODO — UstoGo Backend

**Last updated:** 2026-08-03
**Active phase:** Phase 6 — Hardening & Launch (Phases 1–5 complete). Post-1.0.0: P0 (WhatsApp) landed 2026-08-03.

Working agreement: tasks are executed top to bottom. A task is checked only when it is complete per the Definition of Done in `ROADMAP.md`. Anything discovered mid-task that is out of scope goes to `BACKLOG.md`, never into a `TODO` comment in code.

---

## ✅ Done — Phase 1: Platform Foundation

### 1.1 Repository scaffold

- [x] `nest new` with pnpm/npm, TypeScript strict per `CODING_STANDARDS.md` §1
- [x] Directory tree per `FOLDER_STRUCTURE.md`
- [x] ESLint with the rule set in `CODING_STANDARDS.md` §12 (including `import/no-cycle`, `max-lines`)
- [x] Prettier + `.editorconfig`
- [x] Husky: pre-commit (lint-staged, `tsc --noEmit`), pre-push (unit tests), commit-msg (commitlint)
- [x] `tsconfig` path aliases (`@common/*`, `@modules/*`, …)
- [x] `.env.example` with every variable, no real values
- [x] `README.md` pointing at `docs/`

### 1.2 Local environment

- [x] `docker-compose.yml`: PostgreSQL 16, MinIO, Redis, Mailpit
- [x] Multi-stage `Dockerfile`, non-root user, no dev dependencies in the runtime layer
- [x] `npm run dev` brings up the full stack from a clean clone in ≤ 15 minutes (NFR-OP-5)

### 1.3 Configuration

- [x] `env.schema.ts` (Zod) covering app, database, JWT, storage, mail, throttle
- [x] `AppConfigService` with typed getters
- [x] Boot fails loudly on invalid or missing configuration
- [x] Unit tests: missing secret, short secret, invalid URL

### 1.4 Prisma foundation

- [x] `schema.prisma` — enums + identity + sessions + cities, per `DATABASE.md` §2–4
- [x] Extensions migration: `citext`, `btree_gist`, `pg_trgm`
- [x] `PrismaService` with lifecycle hooks and query logging
- [x] Soft-delete client extension + tests proving deleted rows are invisible by default
- [x] `TransactionManager` with retry on `P2034`
- [x] Seed script skeleton

### 1.5 Common layer

- [x] `AppException` base + generic subclasses
- [x] `GlobalExceptionFilter` with the single envelope + Prisma error mapper
- [x] `ValidationPipe` configured per `VALIDATION.md` §1
- [x] `RequestIdMiddleware` + `X-Request-Id` echo
- [x] Pino logger with the central redaction list
- [x] `@CurrentUser()`, `@Roles()`, `@Public()`, `@ApiAuth()`, `@ApiPaginatedResponse()`
- [x] `PaginationQueryDto`, `PaginatedDto`, `ErrorResponseDto`
- [x] Custom validators: `@IsFutureDate`, `@IsMultipleOf`, `@IsTimeZone`, `@IsAfterField`, `@MaxRangeDays`, `@IsSafeText`
- [x] `LoggingInterceptor`, `TimeoutInterceptor`

### 1.6 Health & Swagger

- [x] `/health` liveness
- [x] `/health/ready` checking PostgreSQL and object storage
- [x] Swagger bootstrap with tags, bearer auth, servers
- [x] `npm run swagger:export` writing `openapi.json` without binding a port
- [x] `SWAGGER_ENABLED` gate for production

### 1.7 F-01 Authentication

- [x] `User`, `RefreshToken`, `PasswordResetToken` models + migration
- [x] `POST /auth/register/client`
- [x] `POST /auth/register/master` (creates `MasterProfile` as `PENDING`)
- [x] `POST /auth/login` with uniform failure + dummy bcrypt comparison
- [x] `POST /auth/refresh` with rotation, family tracking and reuse detection
- [x] `POST /auth/logout`, `POST /auth/logout-all`
- [x] `POST /auth/forgot-password` (always 202), `POST /auth/reset-password`
- [x] `PATCH /auth/password` revoking other sessions
- [x] `JwtStrategy` re-reading user state from the database
- [x] `JwtAuthGuard` registered globally, `RolesGuard`
- [x] Throttling: the `API.md` §13 limits, keyed by IP
- [x] Throttling: identifier-scoped keys (IP+email, email, userId) and Redis storage — closes **B-77**
- [x] **100% branch coverage** — every file in `src/modules/auth/**`, `jwt-auth.guard` and `roles.guard` at 100% lines/branches/functions/statements. Closed by the e2e reset-password and change-password journeys (§1.10) and two `registerClient`/`registerMaster` optional-field unit tests.

### 1.8 F-02 Users

- [x] `ClientProfile`, `City` models + seed
- [x] `GET /users/me`, `PATCH /users/me`
- [x] `DELETE /users/me` (soft delete + revoke all sessions)
- [x] `PATCH /users/me/avatar` — landed with §1.9, which supplied the `File` model and the presign/confirm flow it depends on
- [x] `GET /cities`
- [x] Repository projections that exclude `passwordHash` structurally

### 1.9 F-13 Files

- [x] `File` model + migration
- [x] `StorageProvider` interface + S3 implementation (MinIO locally)
- [x] `POST /files/presign` with MIME and size constraints
- [x] `POST /files/:id/confirm` with server-side HEAD verification
- [x] Presigned read URLs (15 min), scoped to the uploader
- [x] `CleanupUnconfirmedFilesJob`

### 1.10 CLI & CI

- [x] `npm run cli -- admin:create` with an interactive password prompt (never argv)
- [x] GitHub Actions: lint → typecheck → unit → integration → e2e → coverage → audit → gitleaks
- [x] Testcontainers harness, `test-app.factory.ts`, `auth.helper.ts`, `authz-matrix.helper.ts`
- [x] Coverage thresholds enforced in `jest.config.ts` (`jest.all.config.ts`)

### 1.11 Phase 1 exit

- [x] All Phase 1 exit criteria in `ROADMAP.md` met
- [x] `STATUS.md`, `CHANGELOG.md` updated
- [x] Tag `v0.1.0`

---

## 🔴 Now — Phase 2: Supply Side

Reordered from `ROADMAP.md`'s original listing to match `FEATURES.md`'s dependency
graph (`F-01 → F-16 audit → F-05 categories ── F-03 masters ── F-04 moderation`):
audit has to exist before the first privileged mutation it is meant to cover, or F-05
would ship its admin routes unaudited and need a retrofit.

- [x] F-16 Audit: `AuditLog` model, `AuditInterceptor` with redaction, `GET /admin/audit-logs`
- [x] F-05 Categories: model, tree endpoint, admin CRUD, depth/leaf rules, caching
- [x] F-03 Masters: profile fields, category attachment, certificates, submit/resubmit, public projection
- [x] F-04 Moderation: approve/reject/activate/deactivate with readiness checks, notifications, audit
- [x] `GET /admin/masters`: filterable listing (`approvalStatus`, `status`, `cityId`, `categoryId`, `search`) — API.md §12 documented this alongside the moderation actions above but it was never wired up until now
- [x] F-06 Services: CRUD, leaf-category and pricing rules, soft delete
- [x] Seed: cities and the initial category tree

---

## ✅ Done — Phase 3: Discovery

- [x] F-07 Schedule: `WorkingDay`, `ScheduleException` models, `AvailabilityCalculator` (pure, timezone-correct via `Intl`, no new dependency), `masters/me/schedule` CRUD
- [x] Availability endpoint (`GET /masters/:id/availability`) — 31-day cap as a named `DATE_RANGE_TOO_LARGE`, not generic validation
- [x] F-08 Search: dedicated `SearchModule`, real full-text via a generated `tsvector` + GIN index, a real price aggregate for `price:asc`/`price:desc`, category-descendant matching, `availableOn`
- [x] Performance pass: index verification and query-count (no-N+1) assertions in `test/e2e/performance.e2e-spec.ts`; `k6/search.js` and `k6/availability.js` for the p95 measurement at scale (manual, not CI — needs a 50k-master seed)

---

## ✅ Done — Phase 4: The Transaction

- [x] F-09 Bookings: `Booking`/`BookingStatusHistory` models, `bookings_no_overlap` GiST exclusion constraint + `booking_number_seq`, `BookingStateMachine` (100% branches), six ordered pre-conditions on create, `SERIALIZABLE` acceptance with an application-level overlap re-check, reject/cancel(client·master·admin)/start/complete
- [x] Progressive contact-detail disclosure in `BookingResponseDto` (district-only until `ACCEPTED`), e2e-verified
- [x] `ExpirePendingBookingsJob` (every 10 min, batches of 100, `FOR UPDATE SKIP LOCKED`) and `BookingReminderJob` (default proposed per `CLAUDE.md` §3 — no FR/SRS times this one; documented in `booking.constants.ts`)
- [x] F-11 Notifications: `Notification` model, event listeners on booking/master-moderation/review events (never called directly — `NotificationsModule` is import-free of every module it listens to), list/unread-count/mark-read/mark-all-read, admin broadcast
- [x] F-10 Reviews: booking-gated creation (30-day window), 24h edit window, one reply per review, admin hide/unhide, `ratingAverage`/`ratingCount` recomputed from the current `VISIBLE` set inside the same transaction as every write
- [x] Concurrency suite: direct-insert bypass proving the exclusion constraint, parallel `accept()` on overlapping bookings (exactly one wins), parallel review creation on one booking (exactly one survives)

---

## 🟡 In Progress — Phase 5: Engagement & Ops

- [x] F-12 Chat: `Conversation`/`Message`/`MessageAttachment` models, find-or-create conversation gated on a shared non-expired booking (BR-60, `NO_SHARED_BOOKING`), cursor-paginated message history, send/read/sender-side-delete, attachment ownership via `FilesService`
- [x] `/chat` Socket.io namespace: JWT handshake reusing `JwtStrategy`, Redis adapter for cross-instance fan-out, rooms keyed by conversation id, `message:new`/`message:read`/`typing`/`error` — broadcast-only over the REST writes
- [x] `NotificationsModule` message listener (`chat.message.sent` → `MESSAGE_RECEIVED`), no direct call from `ChatModule`
- [x] Admin audited conversation read (`GET /admin/conversations/:id/messages`, `AuditAction.CONVERSATION_ACCESSED`) — no in-app dispute flag exists in v1, so reachable by any admin, always audited
- [x] F-14 Banners: `Banner` model (`BannerPosition`), admin CRUD (`ADMIN`-only, audited) plus public `GET /banners?position=` filtered to the active window (`isActive` AND current instant inside `[startsAt, endsAt]`, either bound optional), `imageKey` resolved to a confirmed `File` via `FilesService.getAttachable` following the F-12 `attachmentKeys` precedent
- [x] F-15 Admin dashboard: `GET /admin/dashboard?from=&to=`, a table-less `AdminModule` querying `PrismaService` directly — user/master/booking counts, completion/cancellation/acceptance rates, review aggregate, top 10 categories by booking volume, zero-filled daily series. `from`/`to` independently optional (30-day default window, 366-day cap, `DATE_RANGE_TOO_LARGE` reused)
- [x] Broadcast notifications (`POST /admin/notifications/broadcast`, shipped with F-11 in Phase 4)
- [x] Prometheus metrics: `GET /metrics` (`ADMIN`-protected), `MetricsInterceptor` recording request rate/error rate/latency histogram for every request, plus Node.js default metrics. DB pool and job-outcome gauges, and Grafana dashboards themselves, are not implemented — flagged in STATUS.md
- [x] Load test scripts: `k6/simple-reads.js` (NFR-P-1), `prisma/seed/scale.seed.ts` + `npm run seed:scale` for NFR-P-2's 50k-master dataset. Execution stays a manual/staging step, same as the two Phase 3 scripts

**Phase 6** — email verification, admin 2FA, device list, idempotency keys, data export/anonymised deletion, RS256, pentest, restore rehearsal, runbook, v1.0.0.

---

## ✅ Done (except pentest) — Phase 6: Hardening & Launch — v1.0.0 shipped 2026-07-30

- [x] Email verification: `EmailVerificationToken` model (same shape as `PasswordResetToken`), `AuthService.registerClient`/`registerMaster` issue a token right after commit, `POST /auth/verify-email` (public, single-use), `POST /auth/resend-verification` (authenticated, `409 EMAIL_ALREADY_VERIFIED` if already verified). Not gated on anything else in v1 — no FR/SRS document ties `emailVerifiedAt` to an access restriction, so no enforcement was invented.
- [x] Two-factor authentication for admin accounts: TOTP (RFC 6238) against `node:crypto`, `User.totpSecret`/`totpEnabledAt` + `TwoFactorChallenge` model, `POST /auth/2fa/{setup,enable,disable,verify}`, `AuthService.login` returns a `challengeToken` instead of tokens when `totpEnabledAt` is set
- [x] Device/session list with per-device revocation: `GET /auth/sessions` folds `RefreshToken` rows into one row per family (device), most recently active first; `DELETE /auth/sessions/:id` revokes a family, `404 SESSION_NOT_FOUND` for an unknown or foreign one
- [x] Idempotency keys on mutating endpoints: `IdempotencyKey` model + `IdempotencyInterceptor` (registered globally, no-op without `@Idempotent()`, same precedent as `AuditInterceptor`); applied to `POST /bookings` and `POST /admin/notifications/broadcast`; optional `Idempotency-Key` header replays the original response, `409 IDEMPOTENCY_KEY_REUSED`/`IDEMPOTENCY_KEY_IN_PROGRESS` otherwise
- [x] Personal data export and anonymised deletion: `GET /users/me/export` (account, bookings, reviews, notifications, v1 scope of `BACKLOG.md` B-70); `DELETE /users/me` now overwrites `email`/`phone`/`firstName`/`lastName`/`defaultAddress`/`bio`/avatar rather than only soft-deleting
- [x] RS256 migration for access tokens: `JWT_ACCESS_PRIVATE_KEY`/`JWT_ACCESS_PUBLIC_KEY` (base64 PEM) replace `JWT_ACCESS_SECRET`; `JwtModule`, `JwtStrategy` and `ChatGateway`'s handshake verification all moved from HS256 to RS256 with `algorithms: ['RS256']` pinned explicitly
- [ ] External penetration test and remediation — blocked on a scheduled external engagement, not implementable in-repo
- [x] Backup restore rehearsal (RTO 1 h, RPO 15 min): `npm run backup:rehearse` (`scripts/backup-restore-rehearsal.sh`) dumps/restores/verifies against the local dev stack — run once, 2s, all sampled tables matched. The quarterly rehearsal against a real production-scale backup is a recurring ops task this script exists to make repeatable, not a one-time code deliverable
- [x] Production runbook and on-call rotation: `DEPLOYMENT.md` §11 has 6 incident scenarios (including the two Phase 6 added: 2FA lockout, stuck idempotency key) plus an On-Call Rotation section documenting the escalation path; the named weekly schedule itself is a staffing decision left to the team
- [x] v1.0.0 release: tagged 2026-07-30, pushed to `origin` — shipped without the external penetration test above (see `CHANGELOG.md` [1.0.0])

---

## 🟡 Post-1.0.0: Frontend contract gaps

- [x] **P0 — WhatsApp contact (2026-08-03)**: `whatsapp_phone`/`whatsapp_enabled`/`whatsapp_changed_at` on `MasterProfile`, `whatsapp_link_clicked_at` on `Booking`; registration phone adopted as initial WhatsApp number; `PATCH /users/me` change (E.164, 24 h cooldown, `422 WHATSAPP_CHANGE_COOLDOWN`) + on/off toggle; published on the public profile only while enabled, always in admin listing and (for the client) booking detail; `POST /bookings/:id/whatsapp-click` first-click analytics (client-owner-only, 404 for foreign); demo masters seeded with `+992…` numbers. Migration `20260803210000_add_whatsapp_contact` applied to the deployed Render/Neon DB (connectivity blocked `migrate deploy` locally; applied via `prisma db execute` + manual `_prisma_migrations` record). 1046 tests total (832 unit + 214 e2e). Note: Prisma 6 rejects scalars inside `include` at runtime (`IncludeOnScalar`) — the shared public projection is now `select`-based (`master-public.mapper.ts`, `MASTER_PUBLIC_SELECT`).
- [x] Favorites (`GET/POST/DELETE /favorites`)
- [x] B-45 Master portfolio/gallery (`masters/me/portfolio` CRUD + reorder, `PortfolioImage` model, `MasterPublicResponseDto.portfolioImageFileIds`)
- [x] Search performance pass: split count/data in `SearchService` (parallel `Promise.all` instead of `COUNT(*) OVER()`), four additive indexes (`(approvalStatus, isActive, createdAt DESC)`, `(approvalStatus, isActive, ratingAverage DESC)`, `(approvalStatus, isActive, deletedAt)` covering count, `displayName` GIN trigram for the admin `ILIKE`). Measured at 50k masters: data query 39ms → 0.2ms, count 16ms → 6.1ms, admin `ILIKE` 0.5ms. Migration must be deployed to the Render database (`npm run prisma:migrate:deploy`)
- [ ] e2e coverage for both (unit-level only so far)
- [ ] Run `prisma migrate deploy` and re-run `prisma db seed` against the deployed Render database — production currently has 0 masters and the old 3-root category taxonomy

---

## 📌 Standing Rules

- No `TODO` comments in merged code — they belong here or in `BACKLOG.md`
- No stub or placeholder implementations
- Update `STATUS.md`, `CHANGELOG.md` and this file when a task completes
- One feature at a time, in the order given
- If a task turns out to be larger than expected, split it here rather than starting it half-finished
