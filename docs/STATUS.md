# Project Status — UstoGo Backend

**Last updated:** 2026-07-29
**Current phase:** Phase 1 — Platform Foundation
**Version:** 0.1.0 (in development)
**Overall progress:** ▓▓▓▓░░░░░░ 39% (accounts can be created, read, updated and deactivated)

---

## 1. Snapshot

| Area                | State                                                             |
| ------------------- | ----------------------------------------------------------------- |
| Documentation       | ✅ Complete — 32 documents, v1 baseline frozen                    |
| Repository scaffold | ✅ Complete — NestJS 11, strict TypeScript, lint/format/hooks     |
| Local environment   | ✅ Complete — compose stack healthy in ~9s, image builds and runs |
| Configuration       | ✅ Complete — Zod-validated at boot, 34 unit tests, 100% covered  |
| Database schema     | 🟨 §2–4 migrated and seeded; catalogue and bookings still to come |
| Authentication      | ✅ Complete — registration, login, rotation, reset; 283 tests     |
| Business features   | 🟨 F-02 Users done; catalogue and bookings still to come          |
| Common layer        | ✅ Complete — envelope, validation, correlation, logging          |
| Tests               | 🟨 307 unit tests; no integration or e2e harness yet              |
| CI/CD               | ⬜ Not started                                                    |
| Deployment          | ⬜ Not started                                                    |

The application boots, connects to PostgreSQL, serves `/health` and `/health/ready`, and publishes Swagger at `/api/docs`. Every request passes through the correlation middleware, the validation pipe, the timeout and logging interceptors and the global exception filter, so an unknown path returns the documented error envelope rather than a framework default. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` are green.

All nine `/auth` endpoints are live and were driven end to end against the running stack: registration, login with an indistinguishable failure for unknown-email and wrong-password, refresh rotation, reuse detection revoking the family, logout, password change and a full reset cycle including the email arriving in Mailpit.

Three gaps, none a blocker:

- **Auth is not yet at the mandated 100% branch coverage.** `token.service`, `password-reset.service` and `roles.guard` are at 100%; `auth.service` is at 90%, `jwt-auth.guard` at 89%, `password.service` at 54% (a thin bcrypt wrapper), and the controller at 0%. The controller is covered by the e2e suite in §1.10. This is an explicit Phase 1 exit criterion and remains open.
- **Rate limits are keyed by IP only, and stored in memory.** `AUTHENTICATION.md` §9 keys login on IP+email, forgot-password on email and refresh on userId, with Redis storage so limits are global rather than per-instance. Blocked on open decision **D-5**; recorded as B-77.
- Redis is validated at boot but nothing connects to it yet. The object store is probed for reachability by readiness; a credentialed check arrives with `StorageProvider` in §1.9.

---

## 2. Phase Progress

| Phase                   | Scope                                            | Status         | Progress        |
| ----------------------- | ------------------------------------------------ | -------------- | --------------- |
| 0 — Documentation       | Full `docs/` set                                 | ✅ Done        | ▓▓▓▓▓▓▓▓▓▓ 100% |
| 1 — Platform Foundation | Scaffold, config, Prisma, auth, users, files     | 🟨 In progress | ▓▓▓▓▓▓▓▓░░ 73%  |
| 2 — Supply Side         | Categories, masters, moderation, services, audit | ⬜             | ░░░░░░░░░░ 0%   |
| 3 — Discovery           | Schedule, availability, search                   | ⬜             | ░░░░░░░░░░ 0%   |
| 4 — The Transaction     | Bookings, notifications, reviews                 | ⬜             | ░░░░░░░░░░ 0%   |
| 5 — Engagement & Ops    | Chat, banners, dashboard, metrics                | ⬜             | ░░░░░░░░░░ 0%   |
| 6 — Hardening & Launch  | 2FA, verification, pentest, release              | ⬜             | ░░░░░░░░░░ 0%   |

---

## 3. Feature Status

| ID   | Feature                  | Module                       | Phase | Status |
| ---- | ------------------------ | ---------------------------- | ----- | ------ |
| F-17 | Platform & cross-cutting | `common`, `config`, `prisma` | 1     | ⬜     |
| F-01 | Authentication           | `auth`                       | 1     | ✅     |
| F-02 | Users & profiles         | `users`                      | 1     | ✅     |
| F-13 | File storage             | `files`                      | 1     | ⬜     |
| F-05 | Categories               | `categories`                 | 2     | ⬜     |
| F-03 | Master profile           | `masters`                    | 2     | ⬜     |
| F-16 | Audit log                | `audit`                      | 2     | ⬜     |
| F-04 | Master moderation        | `admin`                      | 2     | ⬜     |
| F-06 | Services                 | `services`                   | 2     | ⬜     |
| F-07 | Schedule & availability  | `schedule`                   | 3     | ⬜     |
| F-08 | Master discovery         | `search`                     | 3     | ⬜     |
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

| Metric                               | Target              | Current                                |
| ------------------------------------ | ------------------- | -------------------------------------- |
| Line coverage                        | ≥ 80%               | 100% (config layer is all that exists) |
| Service/guard coverage               | ≥ 90%               | —                                      |
| Auth & state machine branch coverage | 100%                | —                                      |
| Endpoints implemented                | ~95                 | 0                                      |
| Endpoints documented in Swagger      | 100% of implemented | —                                      |
| Files over 300 lines                 | 0                   | 0                                      |
| `any` occurrences                    | 0                   | 0                                      |
| Open high/critical vulnerabilities   | 0                   | —                                      |

---

## 6. Blockers

None. Phase 1 can begin immediately.

---

## 7. Open Decisions

| #   | Question                                                                     | Owner     | Needed by                    |
| --- | ---------------------------------------------------------------------------- | --------- | ---------------------------- |
| D-1 | Deployment target (managed container platform vs. VPS + Docker)              | Tech lead | Phase 1 CI setup             |
| D-2 | Transactional email provider                                                 | Tech lead | Phase 1 (`MailModule`)       |
| D-3 | Deployment currency and ISO code                                             | Product   | Phase 2 (`Service.currency`) |
| D-4 | Initial city list and category taxonomy content                              | Product   | Phase 2 seed                 |
| D-5 | Redis: managed instance vs. self-hosted (needed for cluster-wide throttling) | Tech lead | Phase 1                      |

None of these block starting Phase 1; each has a documented default (`docker-compose` local equivalents) that carries the work forward.

---

## 8. Next Actions

1. Stand up `docker-compose` (PostgreSQL 16, MinIO, Redis, Mailpit) and the multi-stage `Dockerfile` — `TODO.md` §1.2
2. Implement `ConfigModule` with boot-time Zod validation, and move `main.ts` off its literal port and prefix — §1.3
3. Translate `DATABASE.md` §3–4 into `schema.prisma` and produce the initial migration — §1.4
4. Implement `CommonModule` primitives — §1.5
5. Health endpoints and Swagger bootstrap — §1.6
6. Begin **F-01 Auth** — §1.7

Detailed task list: `TODO.md`.

---

## 9. Update Protocol

This file is updated:

- at the completion of every feature
- at every phase transition
- whenever a blocker appears or clears
- at the end of every working session (`/stop`)

It is updated **with** the code change, in the same commit — never retrospectively.
