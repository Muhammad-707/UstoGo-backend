# Changelog — UstoGo Backend

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

Categories: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` · `Database` · `Docs`

---

## [Unreleased]

## [0.1.0] — 2026-07-29

Phase 1 — Platform Foundation. A running, secured, observable skeleton: a client or a master can register, log in, rotate tokens and manage their own profile; auth sits at 100% branch coverage; CI is green.

### Added
- NestJS 11 application scaffold on TypeScript strict mode. `npm run start:dev` boots an API on `http://localhost:3000/api/v1` with graceful shutdown hooks enabled.
- Toolchain enforcing the gates in `PROJECT_RULES.md` §4: ESLint 9 (flat config) carrying the full rule set from `CODING_STANDARDS.md` §12, Prettier, `.editorconfig`, Jest, and the six `tsconfig` path aliases.
- Git hooks via Husky — pre-commit runs lint-staged and `tsc --noEmit`, pre-push runs unit tests, commit-msg runs commitlint against the Conventional Commits type and scope lists in `NAMING_CONVENTIONS.md` §10.
- `.env.example` covering every variable in `DEPLOYMENT.md` §3, with local defaults and no real secrets.
- Local development stack: `docker-compose.yml` with PostgreSQL 16, MinIO (bucket provisioned on start), Redis and Mailpit, all healthchecked. `npm run dev` brings the stack up and starts the API; `stack:down` and `stack:reset` tear it down. Measured cold start of the containers: ~9 seconds against the 15-minute NFR-OP-5 budget.
- Every compose host port is overridable via `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `MINIO_PORT`, …), so the stack coexists with a native PostgreSQL or another project's containers without either side being stopped. Documented in `DEPLOYMENT.md` §2.
- `ConfigModule` (global) with boot-time Zod validation of every variable in `DEPLOYMENT.md` §3, exposing `AppConfigService` with frozen, typed groups — `app`, `database`, `jwt`, `storage`, `mail`, `redis`, `throttle`. Invalid configuration prints every offending variable and exits 1 before a port is bound; values are never echoed. 34 unit tests, 100% coverage of the parsed surface.
- `PrismaModule` (global) exporting `PrismaService` and `TransactionManager`. `PrismaService` owns the client lifecycle and routes Prisma's log events through the application logger; query text and duration are logged in development, bound parameters never are. `TransactionManager` retries `P2034` write conflicts up to three times with fully jittered exponential backoff.
- Soft-delete client extension. Every read on `User`, `ClientProfile` and `MasterProfile` — including `findUnique`, `aggregate` and `groupBy` — excludes deleted rows. Writes are untouched so that soft-deleting and restoring remain possible, and an explicit `deletedAt` filter always wins, which is the seam `withDeleted()` variants use.
- Idempotent seed script (`npm run prisma:seed`) loading the starter city list. No administrator is seeded: `PROJECT_RULES.md` forbids an admin registration path, and a seeded admin with a known password is that path by another name.
- `CommonModule`: the single error envelope from `ERROR_HANDLING.md` §1, the global validation pipe from `VALIDATION.md` §1, request-correlation middleware, and timeout and logging interceptors — all registered globally so a new controller inherits them rather than opting in.
- `AppException` hierarchy and the complete error-code registry (`ERROR_HANDLING.md` §4) as a frozen const, plus a Prisma error mapper. Raw Prisma messages never reach a client: `P2002` becomes a targeted conflict code, `P2003` an `INVALID_REFERENCE`, and a `23P01` exclusion violation becomes `BOOKING_OVERLAP` rather than a 500.
- `X-Request-Id` correlation. An inbound value is honoured only after validation — it is echoed into a response header and every log line, so an unvalidated one is a header-splitting and log-injection vector. The envelope body, the response header and every log line for a request now carry the same id.
- Structured logging (Pino) with the central redaction list from `ERROR_HANDLING.md` §6. `Authorization` headers, passwords, token hashes and reset tokens are censored by the logger itself, not at call sites.
- Shared DTOs (`ErrorResponseDto`, `PaginatedDto`, `PaginationQueryDto` with the hard limit cap of 100) and decorators (`@CurrentUser`, `@Roles`, `@Public`, `@ApiAuth`, `@ApiPaginatedResponse`). `@ApiAuth` sets the guard metadata and documents it together, so enforcement and specification cannot drift.
- Six custom validators: `@IsFutureDate`, `@IsMultipleOf`, `@IsTimeZone`, `@IsAfterField`, `@MaxRangeDays`, `@IsSafeText`.
- `HealthModule` with `GET /health` (liveness) and `GET /health/ready` (readiness). Both sit **outside** the `/api/v1` prefix, because the container `HEALTHCHECK` and the external uptime probe target `/health` and a probe URL must not move when the API is versioned. Liveness checks nothing by design — a liveness probe that consults a dependency restarts the application when the dependency fails, which loses the instance and fixes nothing.
- Readiness probes PostgreSQL and the object store concurrently, each with a 2-second budget, and returns `503` naming every failing dependency in the standard envelope's `details` array. Verified against a stopped database: liveness stayed `200`, readiness returned `503` with `details: [{ field: "database", … }]`, and both recovered without a restart.
- Swagger at `/api/docs` and `/api/docs-json` per `SWAGGER_GUIDE.md` §1 — all 13 tags, bearer auth and the three servers — gated on `SWAGGER_ENABLED` so production serves no schema.
- `npm run swagger:export` writes the committed `openapi.json` without binding a port, so CI can diff the public contract. `operationId`s are bare method names, which is what makes generated clients readable.
- Multi-stage `Dockerfile` per `DEPLOYMENT.md` §4, now including `prisma generate` in the build stage and the generated client in the runtime stage. A container now reaches `healthy` about 25 seconds after start, which is the `HEALTHCHECK` start period plus one interval — it had reported `unhealthy` since the Dockerfile landed, because `/health` did not exist yet. The image grew from 259 MB to 616 MB with the Prisma engines; recorded as B-75.
- **F-02 Users.** `GET /users/me` returns the account with whichever profile the role implies, `PATCH /users/me` applies a partial update, and `DELETE /users/me` soft-deletes the account and revokes every session in one transaction — after which the email and phone are free to register again. `GET /cities` serves the public reference list.
- `passwordHash` is excluded **structurally** rather than filtered out: every read goes through a Prisma `select` that never names it, so the row has no such property and neither does its inferred type. A response mapper cannot leak a field that was never fetched.
- A profile field belonging to the other role — `displayName` sent by a client — is rejected with `422` naming the field, not silently dropped. Silent stripping is what `forbidNonWhitelisted` exists to prevent, and it should not reappear one layer down.
- Decimal values (`ratingAverage`, city coordinates) serialise as fixed-scale strings. A JSON number cannot carry a scale guarantee, and a client reading a rating as a float loses it silently.
- **F-01 Authentication.** All nine `/auth` endpoints: registration for clients and masters, login, refresh, logout, logout-all, forgot-password, reset-password and password change. Access tokens are 15-minute HS256 JWTs carrying no PII; refresh tokens are opaque 512-bit values stored only as a SHA-256 hash, so a database dump yields no usable sessions.
- Refresh-token rotation with family tracking and reuse detection. Replaying a consumed token revokes every session in its family and returns `REFRESH_TOKEN_REUSED`; two concurrent refreshes of the same token leave exactly one successor, and the loser is *not* treated as reuse — revoking the family there would also revoke the token the winner just received.
- Login cannot be used to discover which addresses are registered: an unknown email and a wrong password return byte-identical bodies, and the unknown-email path burns a real bcrypt comparison against a dummy hash derived from the configured cost. Measured at 254ms versus 270ms against a running server. Account status is reported only *after* the password verifies, so `ACCOUNT_BLOCKED` cannot confirm an address either.
- `JwtStrategy` re-reads the account on every request, so a blocked or deleted user loses access immediately rather than whenever their token expires. `JwtAuthGuard` is global with `@Public()` as the only opt-out — forgetting a decorator locks an endpoint rather than opening it.
- Password reset stores only the token hash, issues one active link per user, and revokes **every** session on completion.
- `MailModule` behind a `MailProvider` interface, with SMTP delivery and bounded retry. Delivery never decides the outcome of the request that triggered it: `/auth/forgot-password` answers 202 either way, so relay behaviour cannot become an enumeration signal.
- Rate limits from `API.md` §13, keyed by IP.
- **F-13 Files.** `POST /files/presign` issues a short-lived upload URL, `POST /files/:id/confirm` verifies the stored object, and `GET /files/:id/url` signs a 15-minute read URL. Binaries never pass through the API process — the client PUTs directly to the object store, which is what keeps a 10 MB upload off the request path (`SECURITY.md` §2.7).
- Nothing a client declares at presign time is trusted. The MIME type and size are checked there only to fail fast and to bound what the signed URL will accept — `ContentLength` is signed into the URL, so the store itself rejects an oversized body rather than the API discovering it after the bandwidth is spent. A file becomes usable only at confirmation, which HEADs the object and reads its **real** content type and size; a mismatch deletes both the object and the row. Confirmation is idempotent, so a client retrying after a dropped response is not punished for it.
- The object key is built as `<prefix>/<userId>/<uuid><ext>` and never contains the name the client sent — only its extension, and only after being restricted to a short alphanumeric run. Object stores accept `../` in a key, which makes a key built from user input both a traversal and a content-type-confusion surface.
- `StorageProvider` interface with an S3 implementation (MinIO locally, S3 in production). `head` reports a missing and an unreadable object identically — both mean the key cannot be confirmed — and `remove` tolerates an already-absent object so the hourly cleanup job cannot stall on one unremovable key.
- `CleanupUnconfirmedFilesJob` reclaims two populations that otherwise leak storage indefinitely: presigns abandoned more than 24 hours ago, and files released by a replacement. It deletes the object before the row, so a failure between the two leaves a row to retry from rather than an orphan nothing points at, and reads through the **unfiltered** Prisma client — `File` is soft-deletable, so the default client would hide exactly the rows the job exists to collect.
- **`PATCH /users/me/avatar`** (FR-3.3, completing F-02). Attaches a file that is already confirmed and carries purpose `AVATAR`; the previous avatar is released for the cleanup job, so replacing a picture does not leave the old object paid for indefinitely. A file belonging to another user, or uploaded for another purpose, returns `404` rather than `403` — a distinguishable response makes an id probeable for existence.
- The endpoint takes `fileId` where `API.md` §4 and FR-3.3 said `fileKey`; both documents were reconciled to the id in the same commit. The key is server-generated and returned only for correlation, while the id is the handle for the row carrying `isConfirmed` — the state the attach step exists to check. Accepting a key would mean resolving it to that row anyway, over a value the client is free to invent.

- **Admin bootstrap CLI.** `npm run cli -- admin:create --email=...` creates the `ADMIN` account that no HTTP route can create, and that `PROJECT_RULES.md` forbids seeding with a known password. The password is only ever entered interactively and is not echoed; passing `--password` is refused with an explanation rather than quietly accepted, because an argv value is visible in `ps`, in shell history and in any CI log that echoes the command. It is asked for twice and compared — input is not echoed, and a typo would otherwise lock the only account that can administer the platform, with no self-service reset that does not itself require an administrator. `USER_ROLES.md` §3 advertised a `--password=` flag and was reconciled in the same commit.
- The CLI boots its own minimal Nest context rather than `AppModule`. Booting the application module would start the cron scheduler, the throttler and the global guards in a process that serves no requests — `admin:create` would begin running the hourly file-cleanup job as a side effect of creating an account.
- **CI pipeline and end-to-end test harness** (closes §1.10). `test/setup/global-setup.ts` starts real PostgreSQL and MinIO containers via Testcontainers, runs `prisma migrate deploy` and the seed against them, and boots the unmodified `AppModule` — the e2e suites exercise the real request pipeline, not a stubbed one. `test-app.factory.ts` overrides `ThrottlerStorage` (never the guard itself — it is registered under `APP_GUARD`, so `overrideGuard` has no provider to replace) so a suite not about rate limiting is not incidentally asserting it, and `MAIL_PROVIDER` with a capturing stub, since no SMTP relay is reachable from these containers. `auth.helper.ts` and `authz-matrix.helper.ts` generate the six-case authorization matrix — 401 no token, 401 malformed, 401 forged signature, 403 wrong role, 404 (not 403) for a foreign resource, 200 without over-exposed fields — from one spec per protected endpoint, so the case that is usually forgotten cannot be forgotten selectively. Four suites land on it: `auth`, `users`, `files`, `throttling` — 58 tests.
- `.github/workflows/ci.yml`: four jobs on every push and pull request — lint/typecheck/build plus a diff of the committed `openapi.json` against a fresh export, `test:cov` (unit and e2e in one run, so the coverage gate sees a controller that only the e2e suite exercises), a production-dependency audit at `high` and above, and a full-history `gitleaks` secret scan. Testcontainers starts its own dependencies, so the workflow declares no service containers.
- Coverage thresholds in `jest.all.config.ts`: a global floor (90% lines/statements, 78% branches) plus a 100%-branch floor on `token.service`, `password-reset.service` and `roles.guard`, and a 90%-line floor on every service, guard and interceptor. Living in `jest.all.config.ts` rather than `jest.config.ts` is deliberate: a controller is covered by the e2e suite and by nothing else, and a threshold measured against the unit run alone would report it as untested.
- **Closes §1.7: auth at 100% branch coverage.** The e2e reset-password journey (driven with the token captured by the `MAIL_PROVIDER` stub, since only its hash is ever persisted) and the change-password journey closed the auth controller's last two uncovered lines. Two unit tests closed `AuthService`'s remaining branches: `registerClient` with a supplied and valid `cityId`, and `registerMaster` with `bio` and `yearsOfExperience` supplied — both were exercised only in their omitted form before.

### Removed
- `AUTH_EVENT.REFRESH_TOKEN_REUSED`, `RefreshTokenReusedEvent` and `AUTH_EVENT.PASSWORD_RESET`. Declared but never emitted — `token.service` only logs a reuse, and nothing constructs the class or reads the constant — so they were dead code the coverage gate would have forced a test against rather than a real requirement. `NotificationsModule` (Phase 4) is what actually needs them; they land with it.

### Security
- `GET /files/:id/url` is scoped to the uploader and returns `404` for anyone else's file. As first written it signed a URL for any confirmed id, which would have let any authenticated user walk ids and read another master's certificates — the API1 Broken Object Level Authorization case `SECURITY.md` §3 commits to closing. Files that are visible to others by design, such as a master's avatar in a search result, are signed by the module owning that projection through `createReadUrlForKey`, which is reached only after that module has decided the caller may see the row.

### Fixed
- **Refresh-token reuse detection never fired.** Rotation marks the consumed row both `usedAt` and `revokedAt`, and the revoked check ran first — so replaying a stolen token returned `INVALID_REFRESH_TOKEN` and the family was never revoked. The scheme's entire security value is that a theft becomes detectable; it was silently absent. Found by replaying a token against a running server, fixed by ordering the reuse check first, and pinned by tests including one that holds whatever combination of flags is set.
- **Every named rate limiter applied to every route.** `@nestjs/throttler` runs all declared throttlers and `@Throttle` only overrides the one it names, so a registration was simultaneously counted against the forgot-password bucket and started returning 429 on the fourth attempt. One throttler is now declared and overridden per route.
- **Soft delete did not apply inside transactions.** `TransactionManager` started transactions from the base Prisma client, which hands the callback an unextended handle, so every read inside a transaction saw deleted rows. This was the one place `DATABASE.md` §1's guarantee silently did not hold, and the place it matters most: uniqueness checks and state reads happen inside transactions, so a soft-deleted account could have been treated as live. Transactions now run on the soft-delete-aware client. Confirmed against the running database before and after, and pinned by a regression test.
- `npm ci` failed inside the Docker build with `Missing: @emnapi/core@2.0.0-alpha.3 from lock file`. `package-lock.json` had been generated on Windows, where npm resolves the wasm32-wasi optional dependency subtree of `unrs-resolver` (reached via `eslint-import-resolver-typescript`) differently and never records the hoisted `@emnapi` packages that Linux needs. Regenerating the lock inside a `node:22-alpine` container produces a lock valid on both platforms. Regenerate it the same way after adding a dependency.

### Database
- Migration `20260728221845_init_identity_sessions_cities` — creates the `citext`, `btree_gist` and `pg_trgm` extensions, all enums from `DATABASE.md` §2, and the §3–4 tables: `users`, `client_profiles`, `master_profiles`, `cities`, `refresh_tokens`, `password_reset_tokens`. Backwards-compatible (initial migration; no prior release).
- Raw SQL beyond what Prisma can express: partial unique indexes `uq_users_email_active` and `uq_users_phone_active`, scoped to live rows so a soft-deleted account releases its email and phone for re-registration; and `CHECK` constraints guarding `master_profiles` years of experience and the denormalised rating and booking counters.
- Migration `20260729093249_add_files_and_avatars` — creates `files` per `DATABASE.md` §11 and adds the nullable `avatar_file_id` column to both profile tables. Additive and backwards-compatible: every new column is nullable and no existing column changes, so the previous release runs unchanged against this schema. The avatar foreign keys are `ON DELETE SET NULL`, so reclaiming a file can never cascade into deleting a profile. A `CHECK` constraint rejects a zero-byte file, since size is what the confirmation check compares against.
- Deferred deliberately, each landing with the feature that needs it: `Certificate` (Phase 2) and `MasterProfile.searchVector` (Phase 3). The runtime image carries `dist/` and production dependencies only — no source, no dev dependencies — and runs as the non-root `app` user. Dependency install scripts are disabled in both stages.

### Fixed
- `nest build` emitted an incomplete `dist/`. `incremental: true` wrote its build-info file outside `outDir` while `deleteOutDir` wiped `dist/`, so TypeScript saw an up-to-date project, emitted only the files touched since the previous run, and produced a `dist/` that failed at `require`. The build-info file now lives inside `dist/`.

### Changed
- `VALIDATION.md` §2 now requires `@IsDefined()` alongside `@ValidateNested()` and `@Type()` on every required nested object. `@ValidateNested()` runs the child's decorators only when the value exists, so omitting the property entirely passed validation — the same silent hole as forgetting `@Type()`, and harder to spot. Pinned by a regression test.
- ESLint configuration is `eslint.config.mjs` (flat config) rather than the `.eslintrc.cjs` originally specified: ESLint 9 defaults to flat config and ESLint 10 drops `.eslintrc` entirely. `FOLDER_STRUCTURE.md` §1 and `CODING_STANDARDS.md` §12 updated to match; the rule set itself is unchanged.

### Docs
- Complete documentation baseline (32 documents) covering requirements, architecture, data model, API, security and process.
- Frozen v1 scope decisions: payments off-platform, S3-compatible storage, chat designed now / built in Phase 5, REST-only API.
- 10 architecture decision records in `ARCHITECTURE.md` §11.
- Error code registry in `ERROR_HANDLING.md` §4.
- Booking state machine defined as a single authoritative transition table (`FUNCTIONAL_REQUIREMENTS.md` §7.1).
- Six-case authorization test matrix mandated for every protected endpoint (`AUTHORIZATION.md` §8).

### Planned for 0.1.0
Project scaffold · configuration validation · Prisma foundation with soft delete · common layer · health and Swagger · authentication with refresh rotation and reuse detection · user profiles · file storage · admin bootstrap CLI · CI pipeline.

---

## [0.0.0] — 2026-07-29

### Added
- Repository initialised.
- Documentation baseline established as the single source of truth.

---

## Conventions

### Entry format

```markdown
## [1.2.0] — 2026-09-15

### Added
- `POST /bookings/:id/reschedule` — clients may move a booking once, ≥ 24 h before the slot. (#142)

### Fixed
- Availability computation dropped the final slot when a working day ended exactly on a slot boundary. (#151)

### Database
- Migration `20260915_add_booking_reschedule_count` — adds `bookings.reschedule_count` (nullable, backfilled to 0).

### Security
- Refresh token reuse now revokes the entire token family instead of the single token. (#149)
```

### Rules

1. **Every user-visible or contract-affecting change gets an entry.** Internal refactors that change no behaviour do not.
2. **Write for the consumer of the change**, not for the person who made it. "Clients may move a booking once" is useful; "refactored BookingService" is not.
3. **Database migrations always get an entry** under `Database`, naming the migration and stating whether it is backwards-compatible.
4. **Security fixes always get an entry** under `Security`, with enough detail for an operator to assess exposure and without enough detail to be a working exploit.
5. **Breaking changes** are called out explicitly with a `BREAKING:` prefix and a migration note. A breaking change to the public API requires a new API version, not just a changelog line.
6. Entries link to the pull request or issue.
7. `[Unreleased]` accumulates during a phase and is renamed to a version on release.

### Versioning

| Bump | When |
| --- | --- |
| **MAJOR** | Breaking change to the public API contract |
| **MINOR** | New backwards-compatible feature |
| **PATCH** | Backwards-compatible fix |

Pre-1.0.0, MINOR bumps mark phase completions:

| Version | Milestone |
| --- | --- |
| 0.1.0 | Phase 1 — Platform Foundation |
| 0.2.0 | Phase 2 — Supply Side |
| 0.3.0 | Phase 3 — Discovery |
| 0.4.0 | Phase 4 — The Transaction |
| 0.5.0 | Phase 5 — Engagement & Operations |
| 1.0.0 | Phase 6 — Hardening & Launch |
