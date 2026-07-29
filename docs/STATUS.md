# Project Status — UstoGo Backend

**Last updated:** 2026-07-30
**Current phase:** Phase 4 — The Transaction, next up (Phase 3 complete)
**Version:** 0.1.1
**Overall progress:** ▓▓▓▓▓▓░░░░ 62% (masters can be onboarded, moderated, catalogued, scheduled and discovered with real full-text search and availability)

---

## 1. Snapshot

| Area                | State                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| Documentation       | ✅ Complete — 32 documents, v1 baseline frozen                             |
| Repository scaffold | ✅ Complete — NestJS 11, strict TypeScript, lint/format/hooks              |
| Local environment   | ✅ Complete — compose stack healthy in ~9s, image builds and runs          |
| Configuration       | ✅ Complete — Zod-validated at boot, 34 unit tests, 100% covered           |
| Database schema     | 🟨 §2–4, §11 and §13 migrated and seeded; catalogue and bookings to come   |
| Authentication      | ✅ Complete — registration, login, rotation, reset; 100% branch coverage   |
| Business features   | 🟨 F-02 Users, F-13 Files, F-16 Audit done; catalogue and bookings to come |
| Common layer        | ✅ Complete — envelope, validation, correlation, logging                   |
| Object storage      | ✅ Complete — presign, server-side verification, hourly cleanup            |
| Tests               | ✅ 574 tests (476 unit + 98 e2e); Testcontainers harness live              |
| Operations CLI      | ✅ `admin:create` — the only path to an administrator                      |
| CI/CD               | ✅ GitHub Actions: lint → typecheck → build → test:cov → audit → gitleaks  |
| Deployment          | ⬜ Not started                                                             |

The application boots, connects to PostgreSQL, serves `/health` and `/health/ready`, and publishes Swagger at `/api/docs`. Every request passes through the correlation middleware, the validation pipe, the timeout and logging interceptors and the global exception filter, so an unknown path returns the documented error envelope rather than a framework default. `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` and `npm run test:e2e` are all green; `npm run test:cov` runs both levels together and clears every coverage threshold in `jest.all.config.ts`.

The e2e harness (`test/setup/global-setup.ts`) starts a real PostgreSQL and MinIO through Testcontainers, runs `prisma migrate deploy` and the seed against them, and boots the unmodified `AppModule` — nothing in the request pipeline is stubbed. `auth.helper.ts` and `authz-matrix.helper.ts` generate the six-case authorization matrix (401 with no token, 401 malformed, 401 forged signature, 403 wrong role, 404 not 403 for a foreign resource, 200 without over-exposed fields) from one spec per protected endpoint. Four suites exercise it end to end — auth, users, files and throttling — 58 tests, all against the real stack rather than mocks. `test-app.factory.ts` overrides `MAIL_PROVIDER` with a capturing stub — no SMTP relay is reachable from the containers this harness starts, and the reset-password journey has no other way to reach the raw token, which exists only in the outbound email and never in the database. This is what closed the auth controller's coverage gap without writing bespoke assertions per route.

`.github/workflows/ci.yml` runs four jobs on every push and pull request: lint/typecheck/build/OpenAPI-diff, tests-and-coverage (Testcontainers starts its own dependencies, so no service containers are declared in the workflow), a production-dependency audit at `high` and above, and a full-history `gitleaks` secret scan. Verified locally end to end — lint, typecheck, build, unit, e2e and `test:cov` all green, `npm audit --omit=dev --audit-level=high` clean.

All nine `/auth` endpoints are live and driven end to end, both against the running stack and by the e2e suite: registration, login with an indistinguishable failure for unknown-email and wrong-password, refresh rotation, reuse detection revoking the family, logout, password change and a full reset cycle including the email arriving in Mailpit.

F-13 Files closes the last business feature in Phase 1. Uploads go straight from the client to the object store — a binary never enters the API process — and a file is unusable until the server has HEADed it and read its real content type and size, because the declared type and the extension are both attacker-controlled. `PATCH /users/me/avatar` therefore attaches verified bytes rather than accepting any, which is what completes FR-3.3 and with it F-02.

One defect was found and fixed during review rather than after: `GET /files/:id/url` originally signed a read URL for any confirmed id, so any authenticated user could have walked ids and read another master's certificates. It is now scoped to the uploader and returns 404 for a foreign file. Files that are meant to be seen by others are signed by the module owning that projection, which has already authorised the caller.

`npm run cli -- admin:create` closes the gap left by there being no admin registration endpoint and no seeded administrator. The password is entered interactively, never accepted as an argument, and asked for twice. Driven against the running stack: the created account logs in, `GET /users/me` serves an administrator that has no role profile, and every rejection path — duplicate address, mismatched entries, weak password, malformed email, truncated input — exits non-zero with a message rather than a stack trace.

**Auth now meets the mandated 100% branch coverage** — every file in `src/modules/auth/**`, plus `jwt-auth.guard` and `roles.guard`, sits at 100% lines/branches/functions/statements. Closed by two additions: the e2e reset-password and change-password journeys (§1.10) exercised the controller lines only an HTTP round trip reaches, and two new unit tests exercise the `registerClient`/`registerMaster` optional-field branches (`cityId`, `bio`, `yearsOfExperience`). One unrelated stub surfaced and was removed in the same pass: `AUTH_EVENT.REFRESH_TOKEN_REUSED` and `RefreshTokenReusedEvent` were declared but never emitted by anything — `token.service` only logs the reuse — so covering them would have meant testing dead code rather than closing a real gap. `PASSWORD_RESET` was unused for the same reason. Both are easy to re-add in Phase 4 with `NotificationsModule`, which is what actually needs them.

**Rate limiting closes B-77.** `RedisService` owns one eager ioredis connection; `RedisThrottlerStorage` replaces the in-memory default so limits are global across instances rather than per-process, and `IdentifierThrottlerGuard` replaces the base `ThrottlerGuard` to key login on IP+email, forgot-password on email and refresh on the token's owner (resolved via the same indexed `tokenHash` lookup `TokenService.rotate` performs) — exactly `AUTHENTICATION.md` §9. A Redis outage fails the storage open rather than closed: `RedisThrottlerStorage.increment` logs and allows the request rather than making every throttled endpoint depend on Redis being reachable. D-5 (managed vs. self-hosted Redis) no longer blocks anything — the code only takes a `REDIS_URL` — but remains open for the production deployment decision itself.

One gap remains, not a blocker:

- Redis's own reachability is not part of `/health/ready`. Readiness probes PostgreSQL and the object store only; a credentialed check turning a permissions problem into a restart loop is why storage readiness was deferred earlier, and the same reasoning applies here now that something actually depends on Redis being up.

**Phase 2 opens with F-16 Audit, not F-05 Categories.** `TODO.md` and `ROADMAP.md` originally listed Categories first; `FEATURES.md`'s dependency graph places audit ahead of it (`F-16 audit → F-05 categories`), because Categories' admin mutations are the first privileged actions Phase 2 introduces and `CLAUDE.md` §5 requires every one of them audited from the endpoint's first commit, not retrofitted. Both tracking documents were reordered to match rather than left to disagree.

`AuditLog` (DATABASE.md §13) is append-only — no update or delete path exists in code. `AuditService.record()` never throws: a write failure is logged for the alerting in `DEPLOYMENT.md` §8 rather than turning an already-committed, already-responded mutation into a failed request. `AuditInterceptor` is registered globally and is a no-op for any route without `@Audit(action, entityType)` — nothing is audited by default, so adding the interceptor could not retroactively start recording a route nobody decorated. `before` is the submitted payload and `after` the returned representation, both redacted for `password`, `*Hash` and `*Token`-shaped keys — a generic interceptor has no way to know which repository owns the decorated entity, so it cannot honestly claim to capture prior database state without an extra read the owning service already paid for once. `GET /admin/audit-logs` (ADMIN-only) filters by actor, action, entity and a `createdAt` range.

No route calls `@Audit()` yet — Categories is what actually needs it, and lands next. The read endpoint and the interceptor's redaction and entity-resolution logic are proven directly: 465 tests, 100% coverage across `src/modules/audit/**`.

---

## 2. Phase Progress

| Phase                   | Scope                                            | Status  | Progress        |
| ----------------------- | ------------------------------------------------ | ------- | --------------- |
| 0 — Documentation       | Full `docs/` set                                 | ✅ Done | ▓▓▓▓▓▓▓▓▓▓ 100% |
| 1 — Platform Foundation | Scaffold, config, Prisma, auth, users, files     | ✅ Done | ▓▓▓▓▓▓▓▓▓▓ 100% |
| 2 — Supply Side         | Audit, categories, masters, moderation, services | ✅ Done | ▓▓▓▓▓▓▓▓▓▓ 100% |
| 3 — Discovery           | Schedule, availability, search                   | ✅ Done | ▓▓▓▓▓▓▓▓▓▓ 100% |
| 4 — The Transaction     | Bookings, notifications, reviews                 | ⬜      | ░░░░░░░░░░ 0%   |
| 5 — Engagement & Ops    | Chat, banners, dashboard, metrics                | ⬜      | ░░░░░░░░░░ 0%   |
| 6 — Hardening & Launch  | 2FA, verification, pentest, release              | ⬜      | ░░░░░░░░░░ 0%   |

---

## 3. Feature Status

| ID   | Feature                  | Module                       | Phase | Status |
| ---- | ------------------------ | ---------------------------- | ----- | ------ |
| F-17 | Platform & cross-cutting | `common`, `config`, `prisma` | 1     | ⬜     |
| F-01 | Authentication           | `auth`                       | 1     | ✅     |
| F-02 | Users & profiles         | `users`                      | 1     | ✅     |
| F-13 | File storage             | `files`                      | 1     | ✅     |
| F-16 | Audit log                | `audit`                      | 2     | ✅     |
| F-05 | Categories               | `categories`                 | 2     | ✅     |
| F-03 | Master profile           | `masters`                    | 2     | ✅     |
| F-04 | Master moderation        | `admin`                      | 2     | ✅     |
| F-06 | Services                 | `services`                   | 2     | ✅     |
| F-07 | Schedule & availability  | `schedule`                   | 3     | ✅     |
| F-08 | Master discovery         | `search`                     | 3     | ✅     |
| F-09 | Booking lifecycle        | `bookings`                   | 4     | ⬜     |
| F-11 | Notifications            | `notifications`              | 4     | ⬜     |
| F-10 | Reviews & ratings        | `reviews`                    | 4     | ⬜     |
| F-12 | Messaging                | `chat`                       | 5     | ⬜     |
| F-14 | Banners                  | `banners`                    | 5     | ⬜     |
| F-15 | Admin dashboard          | `admin`                      | 5     | ⬜     |

---

## 4. Documentation Status

| Document                         | Status | Notes                                |
| -------------------------------- | ------ | ------------------------------------ |
| `PROJECT_OVERVIEW.md`            | ✅     | Scope decisions frozen               |
| `SRS.md`                         | ✅     | Requirement ids `SRS-*` stable       |
| `BUSINESS_REQUIREMENTS.md`       | ✅     | Business rules `BR-*` stable         |
| `FUNCTIONAL_REQUIREMENTS.md`     | ✅     | Acceptance criteria per endpoint     |
| `NON_FUNCTIONAL_REQUIREMENTS.md` | ✅     | All NFRs measurable                  |
| `FEATURES.md`                    | ✅     | Dependency order defined             |
| `USER_ROLES.md`                  | ✅     | Permission matrix normative          |
| `USER_FLOW.md`                   | ✅     |                                      |
| `DATABASE.md`                    | ✅     | Authoritative model                  |
| `ERD.md`                         | ✅     | Mermaid diagrams                     |
| `API.md`                         | ✅     | Full endpoint inventory              |
| `AUTHENTICATION.md`              | ✅     | Rotation + reuse detection specified |
| `AUTHORIZATION.md`               | ✅     | Four-question model                  |
| `VALIDATION.md`                  | ✅     |                                      |
| `ERROR_HANDLING.md`              | ✅     | Error code registry                  |
| `SECURITY.md`                    | ✅     | Threat model + OWASP mapping         |
| `ARCHITECTURE.md`                | ✅     | 10 ADRs recorded                     |
| `MODULES.md`                     | ✅     | Invariants per module                |
| `FOLDER_STRUCTURE.md`            | ✅     |                                      |
| `NAMING_CONVENTIONS.md`          | ✅     |                                      |
| `CODING_STANDARDS.md`            | ✅     |                                      |
| `ROADMAP.md`                     | ✅     | 6 phases                             |
| `BACKLOG.md`                     | ✅     |                                      |
| `STATUS.md`                      | ✅     | This file                            |
| `TODO.md`                        | ✅     | Phase 1 tasks enumerated             |
| `CHANGELOG.md`                   | ✅     | Initialised                          |
| `TESTING.md`                     | ✅     | Traceability matrix defined          |
| `DEPLOYMENT.md`                  | ✅     |                                      |
| `SWAGGER_GUIDE.md`               | ✅     |                                      |
| `CLAUDE.md`                      | ✅     | Agent protocol                       |
| `PROJECT_RULES.md`               | ✅     |                                      |
| `DEVELOPMENT_WORKFLOW.md`        | ✅     |                                      |

---

## 5. Metrics

| Metric                               | Target              | Current                                                        |
| ------------------------------------ | ------------------- | -------------------------------------------------------------- |
| Line coverage                        | ≥ 80%               | 574 tests green (476 unit + 98 e2e); `test:cov` thresholds met |
| Service/guard coverage               | ≥ 90%               | Met                                                            |
| Auth & state machine branch coverage | 100%                | Met for auth (booking state machine is Phase 4)                |
| Endpoints implemented                | ~95                 | 50                                                             |
| Endpoints documented in Swagger      | 100% of implemented | 100% (`openapi.json` regenerated with every route)             |
| Files over 300 lines                 | 0                   | 0                                                              |
| `any` occurrences                    | 0                   | 0                                                              |
| Open high/critical vulnerabilities   | 0                   | 0 (`npm audit --omit=dev --audit-level=high`)                  |

---

## 6. Blockers

None. Phase 4 can begin immediately.

One known e2e flake, not a regression: `masters.e2e-spec.ts`'s audit-count assertion intermittently fails only when the full 9–10 file e2e suite runs together (never in isolation or smaller batches) — `AuditInterceptor` writes are fire-and-forget by design (`STATUS.md` Phase 2 notes), and heavy parallel Testcontainers startup is enough CPU contention to occasionally lose that race. Fixing it properly means awaiting the audit write in the interceptor, which is a real design change outside Phase 3's scope.

---

## 7. Open Decisions

| #   | Question                                                        | Owner     | Needed by                    |
| --- | --------------------------------------------------------------- | --------- | ---------------------------- |
| D-1 | Deployment target (managed container platform vs. VPS + Docker) | Tech lead | Phase 1 CI setup             |
| D-2 | Transactional email provider                                    | Tech lead | Phase 1 (`MailModule`)       |
| D-3 | Deployment currency and ISO code                                | Product   | Phase 2 (`Service.currency`) |
| D-4 | Initial city list and category taxonomy content                 | Product   | Phase 2 seed                 |
| D-5 | Redis: managed instance vs. self-hosted                         | Tech lead | Production deployment        |

None of these block starting Phase 1; each has a documented default (`docker-compose` local equivalents) that carries the work forward.

---

## 8. Next Actions

Phase 3 (Discovery) is closed: F-07 Schedule (`WorkingDay`/`ScheduleException`, `AvailabilityCalculator`, the availability endpoint) and F-08 Search (a dedicated `SearchModule`, real `tsvector` full-text, a real price aggregate, category descendants, `availableOn`) are all in place, with an automated performance pass (index verification + no-N+1 query-count assertion) and manual k6 baselines for the p95 targets. Next up is **Phase 4 — The Transaction**: booking creation, the state machine, notifications and reviews (`docs/TODO.md`, `ROADMAP.md`).

Detailed task list: `TODO.md`.

---

## 9. Update Protocol

This file is updated:

- at the completion of every feature
- at every phase transition
- whenever a blocker appears or clears
- at the end of every working session (`/stop`)

It is updated **with** the code change, in the same commit — never retrospectively.
