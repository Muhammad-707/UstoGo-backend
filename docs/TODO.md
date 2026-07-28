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

- [ ] `AppException` base + generic subclasses
- [ ] `GlobalExceptionFilter` with the single envelope + Prisma error mapper
- [ ] `ValidationPipe` configured per `VALIDATION.md` §1
- [ ] `RequestIdMiddleware` + `X-Request-Id` echo
- [ ] Pino logger with the central redaction list
- [ ] `@CurrentUser()`, `@Roles()`, `@Public()`, `@ApiAuth()`, `@ApiPaginatedResponse()`
- [ ] `PaginationQueryDto`, `PaginatedDto`, `ErrorResponseDto`
- [ ] Custom validators: `@IsFutureDate`, `@IsMultipleOf`, `@IsTimeZone`, `@IsAfterField`, `@MaxRangeDays`, `@IsSafeText`
- [ ] `LoggingInterceptor`, `TimeoutInterceptor`

### 1.6 Health & Swagger

- [ ] `/health` liveness
- [ ] `/health/ready` checking PostgreSQL and object storage
- [ ] Swagger bootstrap with tags, bearer auth, servers
- [ ] `npm run swagger:export` writing `openapi.json` without binding a port
- [ ] `SWAGGER_ENABLED` gate for production

### 1.7 F-01 Authentication

- [ ] `User`, `RefreshToken`, `PasswordResetToken` models + migration
- [ ] `POST /auth/register/client`
- [ ] `POST /auth/register/master` (creates `MasterProfile` as `PENDING`)
- [ ] `POST /auth/login` with uniform failure + dummy bcrypt comparison
- [ ] `POST /auth/refresh` with rotation, family tracking and reuse detection
- [ ] `POST /auth/logout`, `POST /auth/logout-all`
- [ ] `POST /auth/forgot-password` (always 202), `POST /auth/reset-password`
- [ ] `PATCH /auth/password` revoking other sessions
- [ ] `JwtStrategy` re-reading user state from the database
- [ ] `JwtAuthGuard` registered globally, `RolesGuard`
- [ ] Throttling per `API.md` §13
- [ ] **100% branch coverage** — full case list in `AUTHENTICATION.md` §12

### 1.8 F-02 Users

- [ ] `ClientProfile`, `City` models + seed
- [ ] `GET /users/me`, `PATCH /users/me`
- [ ] `DELETE /users/me` (soft delete + revoke all sessions)
- [ ] `PATCH /users/me/avatar`
- [ ] `GET /cities`
- [ ] Repository projections that exclude `passwordHash` structurally

### 1.9 F-13 Files

- [ ] `File` model + migration
- [ ] `StorageProvider` interface + S3 implementation (MinIO locally)
- [ ] `POST /files/presign` with MIME and size constraints
- [ ] `POST /files/:id/confirm` with server-side HEAD verification
- [ ] Presigned read URLs (15 min)
- [ ] `CleanupUnconfirmedFilesJob`

### 1.10 CLI & CI

- [ ] `npm run cli -- admin:create` with an interactive password prompt (never argv)
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
