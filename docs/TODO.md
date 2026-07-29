# TODO — UstoGo Backend

**Last updated:** 2026-07-29
**Active phase:** Phase 1 — Platform Foundation

Working agreement: tasks are executed top to bottom. A task is checked only when it is complete per the Definition of Done in `ROADMAP.md`. Anything discovered mid-task that is out of scope goes to `BACKLOG.md`, never into a `TODO` comment in code.

---

## 🔴 Now — Phase 1: Platform Foundation

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
- [ ] Throttling: identifier-scoped keys (IP+email, email, userId) and Redis storage — blocked on open decision **D-5**
- [ ] **100% branch coverage** — `token.service`, `password-reset.service` and `roles.guard` are at 100%; `auth.service` is at 90%, `jwt-auth.guard` at 89%, `password.service` at 54% (thin bcrypt wrapper), and the controller at 0%. The controller is covered by the e2e suite in §1.10; the rest needs the remaining branches.

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
- [ ] GitHub Actions: lint → typecheck → unit → integration → e2e → coverage → audit → gitleaks
- [ ] Testcontainers harness, `test-app.factory.ts`, `auth.helper.ts`, `authz-matrix.helper.ts`
- [ ] Coverage thresholds enforced in `jest.config.ts`

### 1.11 Phase 1 exit

- [ ] All Phase 1 exit criteria in `ROADMAP.md` met
- [ ] `STATUS.md`, `CHANGELOG.md` updated
- [ ] Tag `v0.1.0`

---

## 🟡 Next — Phase 2: Supply Side

- [ ] F-05 Categories: model, tree endpoint, admin CRUD, depth/leaf rules, caching, seed taxonomy
- [ ] F-16 Audit: `AuditLog` model, `AuditInterceptor` with redaction, `GET /admin/audit-logs`
- [ ] F-03 Masters: profile fields, category attachment, certificates, submit/resubmit, public projection
- [ ] F-04 Moderation: approve/reject/activate/deactivate with readiness checks, notifications, audit
- [ ] F-06 Services: CRUD, leaf-category and pricing rules, soft delete
- [ ] Seed: cities and the initial category tree

---

## 🟢 Later

**Phase 3** — weekly schedule, exceptions, `AvailabilityCalculator`, availability endpoint, full-text search with GIN, filters/sorting, k6 baseline.

**Phase 4** — booking creation pre-conditions, state machine, exclusion-constraint migration, all transitions, status history, expiry and reminder jobs, contact-disclosure test, notifications, reviews with transactional aggregates, concurrency suite.

**Phase 5** — chat REST + Socket.io gateway, banners, admin dashboard, broadcast notifications, Prometheus metrics, load tests.

**Phase 6** — email verification, admin 2FA, device list, idempotency keys, data export/anonymised deletion, RS256, pentest, restore rehearsal, runbook, v1.0.0.

---

## 📌 Standing Rules

- No `TODO` comments in merged code — they belong here or in `BACKLOG.md`
- No stub or placeholder implementations
- Update `STATUS.md`, `CHANGELOG.md` and this file when a task completes
- One feature at a time, in the order given
- If a task turns out to be larger than expected, split it here rather than starting it half-finished
