# Changelog — UstoGo Backend

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

Categories: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` · `Database` · `Docs`

---

## [Unreleased]

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
- Multi-stage `Dockerfile` per `DEPLOYMENT.md` §4.

### Database
- Migration `20260728221845_init_identity_sessions_cities` — creates the `citext`, `btree_gist` and `pg_trgm` extensions, all enums from `DATABASE.md` §2, and the §3–4 tables: `users`, `client_profiles`, `master_profiles`, `cities`, `refresh_tokens`, `password_reset_tokens`. Backwards-compatible (initial migration; no prior release).
- Raw SQL beyond what Prisma can express: partial unique indexes `uq_users_email_active` and `uq_users_phone_active`, scoped to live rows so a soft-deleted account releases its email and phone for re-registration; and `CHECK` constraints guarding `master_profiles` years of experience and the denormalised rating and booking counters.
- Deferred deliberately, each landing with the feature that needs it: `File` and the `avatarFileId` columns (§1.9), `Certificate` (Phase 2), and `MasterProfile.searchVector` (Phase 3). The runtime image carries `dist/` and production dependencies only — no source, no dev dependencies — and runs as the non-root `app` user. Dependency install scripts are disabled in both stages.

### Fixed
- `nest build` emitted an incomplete `dist/`. `incremental: true` wrote its build-info file outside `outDir` while `deleteOutDir` wiped `dist/`, so TypeScript saw an up-to-date project, emitted only the files touched since the previous run, and produced a `dist/` that failed at `require`. The build-info file now lives inside `dist/`.

### Changed
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
