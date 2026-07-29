# Roadmap — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29
**Rule:** one feature completed end-to-end before the next begins. "Completed" means implemented, validated, documented in Swagger, tested to the coverage bar, and reflected in `STATUS.md` and `CHANGELOG.md`.

Legend: ⬜ not started · 🟨 in progress · ✅ done

---

## Phase 0 — Documentation Baseline ✅

- ✅ Complete `docs/` set (32 documents)
- ✅ Architecture, database and API contracts frozen as the v1 baseline
- ✅ Roadmap, backlog and working agreements established

**Exit criteria:** every document exists, is internally consistent, and no open question blocks implementation.

---

## Phase 1 — Platform Foundation ✅

**Goal:** a running, secured, observable skeleton with working authentication.

- ✅ Project scaffold: NestJS 11, TypeScript strict, ESLint, Prettier, Husky, commitlint
- ✅ `docker-compose` with PostgreSQL 16, MinIO, Redis and Mailpit; multi-stage `Dockerfile`
- ✅ `ConfigModule` with boot-time schema validation
- ✅ `PrismaModule`: client, soft-delete extension, `TransactionManager`
- ✅ Initial Prisma schema and migration (identity, sessions, cities)
- ✅ `CommonModule`: validation pipe, exception filter, serialisation, request id, decorators
- ✅ Structured logging (Pino) with redaction
- ✅ `HealthModule`: `/health`, `/health/ready`
- ✅ Swagger bootstrap with tags and bearer auth
- ✅ **F-01 Auth**: register (client/master), login, refresh with rotation and reuse detection, logout, logout-all, forgot/reset password, change password
- ✅ **F-02 Users**: `/users/me` read and update, avatar, deactivate, cities
- ✅ **F-13 Files**: presign, confirm, S3/MinIO provider, owner-scoped read URLs, cleanup job
- ✅ Admin bootstrap CLI (`admin:create`)
- ✅ Rate limiting (Throttler; Redis-backed, identifier-scoped per `AUTHENTICATION.md` §9)
- ✅ CI pipeline: lint, typecheck, test, audit, secret scan
- ✅ Test harness: Testcontainers, auth helpers, authz matrix helper

**Exit criteria:** a client and a master can register, log in, rotate tokens and manage their own profile; ✅ auth has 100% branch coverage; ✅ CI is green. **Met — tagged `v0.1.0`.**

---

## Phase 2 — Supply Side ⬜

**Goal:** masters can be onboarded, moderated and catalogued.

- ⬜ **F-05 Categories**: public tree, admin CRUD, depth and leaf rules, caching
- ⬜ **F-03 Masters**: professional profile, category attachment, certificates, submit/resubmit, public projection
- ⬜ **F-16 Audit**: `AuditLog`, audit interceptor, admin read endpoint
- ⬜ **F-04 Moderation**: approve, reject, activate, deactivate with readiness checks, notifications and audit
- ⬜ **F-06 Services**: master-scoped CRUD with pricing and duration rules
- ⬜ Seed data: cities and a realistic category tree

**Exit criteria:** an admin can take a master from registration to approved and publicly visible; every moderation action is audited.

---

## Phase 3 — Discovery ⬜

**Goal:** a client can find the right master and see when they are free.

- ⬜ **F-07 Schedule**: weekly working days, exceptions, `AvailabilityCalculator`
- ⬜ Availability endpoint with 31-day range cap and timezone correctness
- ⬜ **F-08 Search**: full-text (`tsvector` + GIN), filters, sorting, pagination
- ⬜ Performance pass: index verification, query-count assertions, k6 baseline

**Exit criteria:** master search meets NFR-P-2 (p95 ≤ 500 ms over 50 000 masters) and availability computation meets NFR-P-5.

---

## Phase 4 — The Transaction ⬜

**Goal:** the core marketplace loop closes.

- ⬜ **F-09 Bookings**: creation with all six pre-conditions
- ⬜ `BookingStateMachine` with 100% branch coverage
- ⬜ Serializable acceptance + GiST exclusion constraint migration
- ⬜ Reject, cancel (client/master/admin), start, complete
- ⬜ `BookingStatusHistory` append-only trail
- ⬜ Expiry job and reminder job
- ⬜ Progressive contact-detail disclosure with an explicit e2e test
- ⬜ **F-11 Notifications**: event listeners, persistence, read state
- ⬜ **F-10 Reviews**: booking-gated creation, edit window, reply, admin hide, transactional aggregates
- ⬜ Concurrency test suite: parallel acceptance, parallel review creation, parallel refresh

**Exit criteria:** the full client journey — search → book → accept → complete → review — passes end to end, and double-booking is provably impossible.

---

## Phase 5 — Engagement & Operations ⬜

- ⬜ **F-12 Chat**: conversations, messages, cursor pagination, read state
- ⬜ Socket.io `/chat` gateway with JWT handshake and Redis adapter
- ⬜ **F-14 Banners**: admin CRUD, public active-window read
- ⬜ **F-15 Dashboard**: aggregate metrics and time series
- ⬜ Admin broadcast notifications
- ⬜ Prometheus metrics endpoint and dashboards
- ⬜ Load testing against NFR targets

**Exit criteria:** operations can run the platform day-to-day without database access.

---

## Phase 6 — Hardening & Launch ⬜

- ⬜ Email verification
- ⬜ Two-factor authentication for admin accounts
- ⬜ Device/session list with per-device revocation
- ⬜ Idempotency keys on mutating endpoints
- ⬜ Personal data export and anonymised deletion
- ⬜ RS256 migration for access tokens
- ⬜ External penetration test and remediation
- ⬜ Backup restore rehearsal (RTO 1 h, RPO 15 min)
- ⬜ Production runbook and on-call rotation
- ⬜ v1.0.0 release

**Exit criteria:** every NFR is measured and met; the security review is closed.

---

## Post-v1 (see `BACKLOG.md`)

Payments and escrow · master subscription tiers and paid promotion · automated identity verification · dispute arbitration workflow · geolocation search with PostGIS · push notifications · multi-language content · public partner API · recommendation ranking.

---

## Dependency Chain

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
platform    supply      discovery   the loop    engagement  hardening
```

No phase starts before the previous one meets its exit criteria. Within a phase, features follow the order in `FEATURES.md` §Feature Dependency Order.

---

## Definition of Done (every feature)

- [ ] Implemented per `FUNCTIONAL_REQUIREMENTS.md`, with no stubs or placeholders
- [ ] DTO validation on every input
- [ ] Named domain exceptions with codes registered in `ERROR_HANDLING.md`
- [ ] Authorization enforced and covered by the six-case matrix
- [ ] Swagger complete: operation, success type, every error code
- [ ] Unit tests to the coverage bar; e2e happy path and primary failure
- [ ] No file over 300 lines; lint, typecheck and audit clean
- [ ] `DATABASE.md` / `API.md` updated if contracts changed
- [ ] `STATUS.md`, `TODO.md`, `CHANGELOG.md` updated
- [ ] Conventional commit
