# TODO — UstoGo Backend

**Last updated:** 2026-08-08
**Active phase:** Phase 6 — Hardening & Launch (Phases 1–5 complete). Post-1.0.0: P0 (WhatsApp) landed 2026-08-03; production DB sync confirmed, observability/security hardening pass (Sentry, Redis health check, helmet/compression) and a Render deploy-pipeline fix landed 2026-08-05.

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
- [x] e2e coverage for both: `test/e2e/favorites.e2e-spec.ts` (idempotent add/remove, newest-first ordering, a pending master's `404 MASTER_NOT_FOUND`, cross-client isolation, authz matrix) and `test/e2e/portfolio.e2e-spec.ts` (the real presign→upload→confirm→attach flow, reorder, soft delete, foreign/wrong-purpose/unconfirmed-file 404s and 409, the 20-image cap, authz matrix) — 27 new e2e tests. Caught and fixed a real bug in the process: `MastersService.listPortfolioImages` and the portfolio cap's `count` query were both missing `deletedAt: null`, so a soft-deleted image stayed listed on `GET /masters/me/portfolio` and kept counting against `PORTFOLIO_IMAGE_LIMIT`, permanently blocking a master who deleted and re-added images. `booking-transition.service.ts` was split (`isLateCancellation` moved to a new `booking-cancellation.util.ts`) to clear a pre-existing 300-line lint failure surfaced while getting the suite green.
- [x] Run `prisma migrate deploy` and re-run `prisma db seed` against the deployed Render database — confirmed 2026-08-05: production has real masters/categories/cities (`prisma migrate status` reports the schema up to date; `GET /masters`, `/categories`, `/cities` against the live API all return real seeded data, not the old 3-root taxonomy)
- [x] `BookingsGateway`: a second Socket.io namespace (alongside `/chat`) pushing live `booking:update` events over websocket — landed with the master dashboard analytics work, undocumented until now
- [x] Master self-service vacation-mode toggle (`PATCH /masters/me/availability`), `profileViews` counter, verified-badge fix
- [x] Master dashboard analytics: `GET /bookings/me/stats` (earnings, 14-day trend, completion rate, `earningsByCategory`, `avgAcceptLatencyMinutes`, `repeatClientRate`); admin bookings/earnings endpoints; live favorites status
- [x] i18n: `Category.nameTj`/`nameRu`/`descriptionTj`/`descriptionRu`, translated cities/districts, `X-Locale` header threading through categories/cities/search/favorites/masters — closes most of `MASTER_PROMPT.md` §6.2 (Russian) at the data layer; `messages/ru` on the frontend is separately complete
- [x] Stock media seeded for demo masters; public master listing banner URL fix

### Post-1.0.0, 2026-08-05: report-and-block between users (MASTER_PROMPT.md §6.8, BACKLOG.md B-14, P5)

- [x] `Report` model (SPAM/FRAUD/ABUSE/OTHER; OPEN/REVIEWED/RESOLVED/REJECTED)
- [x] `POST /reports` (client/master), `GET /admin/reports`, `POST /admin/reports/:id/resolve` — audited (`REPORT_RESOLVED`)
- [ ] Frontend: report menu on profiles, admin reports queue — tracked as a separate frontend task

### Post-1.0.0, 2026-08-05: admin user management (MASTER_PROMPT.md §6.11, P5)

- [x] `GET /admin/users` — role/status/city/search/registration-date filters
- [x] `GET /admin/users/:id` — full detail
- [x] `POST /admin/users/:id/block` / `:id/unblock` — revokes sessions, audited (reuses existing `USER_BLOCKED`/`USER_UNBLOCKED` actions, no migration needed)
- [ ] Frontend: admin users page — tracked as a separate frontend task

### Post-1.0.0, 2026-08-05: certificate moderation (MASTER_PROMPT.md §6.17, P3)

- [x] `GET /admin/certificates?verified=` — moderation queue
- [x] `POST /admin/certificates/:id/verify` / `:id/reject` — audited (`CERTIFICATE_VERIFIED`/`CERTIFICATE_REJECTED`)
- [ ] Frontend: admin certificate moderation page — tracked as a separate frontend task

### Post-1.0.0, 2026-08-05: geo search (MASTER_PROMPT.md §6.3, P3)

- [x] `lat`/`lng`/`radiusKm` on `GET /masters` search — haversine distance to `City.latitude/longitude`, filtered by `LEAST(radiusKm, MasterProfile.serviceRadiusKm)`
- [x] `sort=distance:asc`
- [x] `MasterPublicResponseDto.cityLatitude/cityLongitude/distanceKm` for the frontend map
- [ ] Frontend: Leaflet map view on `/search` — tracked as a separate frontend task

### Post-1.0.0, 2026-08-05: NPS + admin statistics (MASTER_PROMPT.md §5–§6.1, P1)

- [x] `Review.npsScore`/`wouldRecommend` (both optional) collected on `POST /reviews`
- [x] `GET /admin/masters/:id/stats` — clients served, completed/unfinished jobs, rating, NPS, review distribution, 6-month series, top-5 services; audited (`MASTER_STATS_ACCESSED`)
- [x] `GET /admin/nps` — platform-wide NPS + by category + by top-10 master
- [x] `GET /masters/me/nps` — a master's own NPS breakdown
- [ ] Frontend: NPS survey modal after a completed booking's review, admin master-stats page, admin platform NPS block, master dashboard NPS widget — tracked as a separate frontend task

### Post-1.0.0, 2026-08-05 hardening pass

- [x] `RedisHealthIndicator` added to `/health/ready` — closes the gap `STATUS.md` §1 flagged (rate limiting and both Socket.io namespaces hard-depend on Redis; readiness never checked it)
- [x] `helmet()` + `compression()` in `main.ts` — baseline security headers (HSTS, X-Content-Type-Options, X-Frame-Options); CSP deliberately left off (`swagger-ui-dist` needs inline scripts)
- [x] Sentry wired: `initSentry()` in `main.ts` (no-op without `SENTRY_DSN`), `GlobalExceptionFilter` reports every 5xx via `captureException()` — `SENTRY_DSN` had been validated in `env.schema.ts` since Phase 1 but nothing ever called `Sentry.init`
- [x] `master_profiles.search_vector` declared `Unsupported("tsvector")` with a matching `dbgenerated()` default and both its GIN indexes given matching `map` names — `prisma migrate diff` against production now produces an empty migration, closing a footgun that needed hand-fixing at least three times since F-12
- [x] Dockerfile: `npm ci` → `npm install` in both stages — a pre-existing (not caused by this pass) lockfile inconsistency in a transitive devDependency (`unrs-resolver`'s optional wasm32-wasi fallback, via `@napi-rs/wasm-runtime`'s `@emnapi/*` peers) made `npm ci` fail unpredictably depending on which platform last wrote `package-lock.json`; `npm install` reconciles instead of hard-failing. Verified against a live Render deploy (`build_failed` → `live`).
- [x] Root `README.md`/`CLAUDE.md` — corrected the stale "Phase 1, no application code yet" header

---

### Post-1.0.0, 2026-08-06: referral codes and reward ledger (MASTER_PROMPT.md §6.4, BACKLOG.md B-52)

- [x] `ClientProfile.referralCode`/`referredByClientProfileId` (migration `20260806100000_add_referrals`), new `ReferralReward` ledger table with a `@unique` `referredClientProfileId` as the concurrency guard against a double payout
- [x] `GET /me/referral` — lazily generates the caller's own code on first read (no backfill needed for existing rows), returns `referredCount`/`rewardCount`/`totalBonus`
- [x] `POST /auth/register/client` accepts `referralCode` (resolved before the transaction; an unknown or stale code is silently ignored, never a reason to fail registration)
- [x] `ReferralRewardListener` — awards the referrer on the referred client's first `COMPLETED` booking, via `BOOKING_EVENT.COMPLETED`, same never-called-directly precedent as every other `NotificationsModule`-style listener
- [x] Unit tests (`referrals.service.spec.ts`, `referral-reward.listener.spec.ts`) landed with the feature; **e2e coverage was missing until 2026-08-07** — `test/e2e/referrals.e2e-spec.ts` now covers the authz matrix, stable code generation, registration-time linking, the silently-ignored-unknown-code path, and the full register → refer → book → complete → reward journey (polled, since the listener is fire-and-forget the same way `AuditInterceptor` is). This entry itself was also missing from `TODO.md`/`STATUS.md`/`CHANGELOG.md` until now — a documentation-drift gap, not a code gap; `BACKLOG.md` B-52 is marked done in the same pass.

---

### Post-1.0.0, 2026-08-06: multiple saved addresses (BACKLOG.md B-50)

- [x] `SavedAddress` model (`20260806140000_add_saved_addresses`) — labeled, reusable client addresses; `ClientProfile.defaultAddress` untouched
- [x] `GET/POST /users/me/addresses`, `PATCH /users/me/addresses/:id` (partial update + default promotion), `DELETE /users/me/addresses/:id`
- [x] Cap at 10 live rows (`SAVED_ADDRESS_LIMIT_EXCEEDED`), ownership-scoped 404s, single-default invariant enforced in-service
- [x] Unit tests (`saved-addresses.service.spec.ts`) and e2e tests (round trip, city validation, stranger 404, cap)
- [ ] Frontend: address book UI on the booking flow — tracked as a separate frontend task

### Post-1.0.0, 2026-08-06: booking rescheduling (BACKLOG.md B-51)

- [x] `Booking.rescheduleCount` column + `NotificationType.BOOKING_RESCHEDULED` (`20260806130000_add_booking_reschedule`)
- [x] `POST /bookings/:id/reschedule` — client-owner only, `PENDING`/`ACCEPTED` only, once, ≥24h before the current slot; new slot re-validated (lead time, availability, client overlap, master overlap under `SERIALIZABLE`)
- [x] `BookingRescheduleService` (new file, keeps `BookingsService` under the 300-line cap) + booking notification listener case
- [x] Unit tests (`booking-reschedule.service.spec.ts`) and e2e tests (`bookings.e2e-spec.ts`: success + limit + non-owner 404)
- [ ] Frontend: reschedule action on the client's booking detail screen — tracked as a separate frontend task

### Post-1.0.0, 2026-08-06/07: feature batch (BACKLOG.md B-54, B-44, B-35, B-36, B-40 partial, B-15, B-24)

- [x] B-54 photo attachments: `BookingAttachment`, `attachmentKeys` on `POST /bookings`, participancy-scoped `GET /bookings/:id/attachments/:fileId/url`
- [x] B-44 quotes: `QuotesModule` (`Quote`, `POST/GET /quotes`, respond/decline)
- [x] B-35 quick replies: `QuickReply`, `masters/me/quick-replies` CRUD, own controller
- [x] Public fast-responder badge: `MasterProfile.avgAcceptLatencyMinutes`, `MasterPublicResponseDto.isFastResponder`
- [x] Structured cancellation reasons: `Booking.cancellationReasonCode`, admin dashboard breakdown
- [x] B-36 notification preferences (scoped to type): `NotificationPreference`, `GET/PATCH /notifications/preferences`
- [x] Recently viewed masters: `RecentlyViewedMaster`, `POST /masters/:id/view`, `GET /masters/me/recently-viewed`
- [x] B-40 (partial) `.ics` export: `GET /bookings/me/schedule.ics`
- [x] PDF completion receipt: `GET /bookings/:id/receipt.pdf`, hand-rolled writer
- [x] Masters leaderboard: `GET /masters/leaderboard` with badges
- [x] B-15/B-24 reliability score + instant-book: `MasterProfile.reliabilityScore`/`instantBookEnabled`, auto-accept at creation
- [x] Pricing suggestion: `GET /masters/me/pricing-suggestion`
- [x] Schedule optimizer: `GET /bookings/me/schedule-optimizer`
- [x] QR completion certificate: `CompletionCertificate`, `GET /bookings/:id/certificate`, public `GET /certificates/verify/:code`
- [x] Live GPS relay: `/bookings` namespace `location:update`
- [x] Seven new migrations, all additive; full unit (981) + e2e (220) suites green; `lint`/`typecheck`/`build` green
- [ ] Frontend: all fourteen — tracked as separate frontend tasks (QR image rendering, leaderboard UI, live map for GPS relay, etc.)

### Post-1.0.0, 2026-08-08: deployment currency resolved (D-3)

- [x] `SERVICE_CURRENCY` default changed `USD` → `TJS` (`env.schema.ts`, `.env.example`, `.env`) — no migration, `CatalogueConfig.currency` reads the env var at service-creation time; `STATUS.md` D-3 marked resolved

### Post-1.0.0, 2026-08-08: booking payment confirmation (FR-7.7)

- [x] `Booking.paidAmount`/`paymentNote`/`paymentConfirmedAt` (migration `20260808120000_add_booking_payment_confirmation`), `paid_amount >= 0` CHECK
- [x] `POST /bookings/:id/confirm-payment` — client-owner only (404 for a stranger), `COMPLETED` only (`409 BOOKING_NOT_COMPLETED`), once (`409 PAYMENT_ALREADY_CONFIRMED`), `paidAmount < price` requires a note (`422 PAYMENT_NOTE_REQUIRED`)
- [x] `PAYMENT_CONFIRMED` notification to the master via the existing post-commit event pattern
- [x] Unit tests (`payment-confirmation.util.spec.ts`, `booking-payment.service.spec.ts`) and e2e tests (`test/e2e/booking-payment.e2e-spec.ts` — 8 cases: full price, tip, underpay+note, underpay-without-note 422, double-confirm 409, not-completed 409, stranger 404, wrong-role 403)
- [ ] Frontend: payment-confirmation prompt after a completed booking — tracked as a separate frontend task

## 📌 Standing Rules

- No `TODO` comments in merged code — they belong here or in `BACKLOG.md`
- No stub or placeholder implementations
- Update `STATUS.md`, `CHANGELOG.md` and this file when a task completes
- One feature at a time, in the order given
- If a task turns out to be larger than expected, split it here rather than starting it half-finished
