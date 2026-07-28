# Non-Functional Requirements — UstoGo Backend

**Version:** 1.0.0
**Last updated:** 2026-07-29

Every NFR below is measurable. An NFR without a measurement method is an opinion, not a requirement.

---

## 1. Performance

| ID | Requirement | Measurement |
| --- | --- | --- |
| NFR-P-1 | p95 latency ≤ 200 ms for simple reads (profile, single booking, notification list) under 100 rps | k6 load test in staging |
| NFR-P-2 | p95 latency ≤ 500 ms for master search with filters and sorting over 50 000 masters | k6 with a seeded dataset |
| NFR-P-3 | p99 latency ≤ 1 s for any endpoint | APM histogram |
| NFR-P-4 | No endpoint issues more than 10 database queries per request; N+1 patterns are a release blocker | Prisma query logging assertion in e2e tests |
| NFR-P-5 | Availability computation for a 31-day range completes in ≤ 300 ms | Unit benchmark |
| NFR-P-6 | Database connection pool sized to `4 × vCPU`, with pool exhaustion alerting | Pool metrics |

## 2. Scalability

| ID | Requirement |
| --- | --- |
| NFR-S-1 | The API is stateless: any instance can serve any request. No in-process session, cache-of-record or sticky routing. |
| NFR-S-2 | Horizontal scaling to 10 instances requires no code change and no configuration beyond replica count. |
| NFR-S-3 | Every list query is index-backed; sequential scans on tables above 10 000 rows are prohibited in hot paths. |
| NFR-S-4 | Scheduled jobs are safe to run on multiple instances simultaneously (advisory locks or `SKIP LOCKED`). |
| NFR-S-5 | Target capacity for v1: 100 000 users, 20 000 masters, 500 000 bookings, 200 rps sustained. |

## 3. Availability & Reliability

| ID | Requirement |
| --- | --- |
| NFR-A-1 | Monthly uptime target 99.5% (≈3.6 h/month error budget). |
| NFR-A-2 | Zero-downtime deploys via rolling restart; the app handles `SIGTERM` with a graceful drain of ≤ 30 s. |
| NFR-A-3 | Migrations are backwards-compatible with the previous release (expand/contract pattern); a deploy must never require a downtime window. |
| NFR-A-4 | Liveness `/health` and readiness `/health/ready` probes; readiness fails when the database or object storage is unreachable. |
| NFR-A-5 | Nightly full database backup with PITR; restore is rehearsed quarterly with a documented RTO of 1 h and RPO of 15 min. |
| NFR-A-6 | External dependency failures (SMTP, S3) degrade gracefully: the request path that only *needs* the database must not fail because email is down. Email dispatch is queued and retried. |

## 4. Security

Full detail in `SECURITY.md`. Headline requirements:

| ID | Requirement |
| --- | --- |
| NFR-SEC-1 | TLS 1.2+ enforced at the edge; HSTS enabled. |
| NFR-SEC-2 | Passwords hashed with bcrypt cost ≥ 12; never logged, never returned. |
| NFR-SEC-3 | Access token TTL 15 min; refresh token TTL 30 days, rotating, hashed at rest, with reuse detection. |
| NFR-SEC-4 | All input validated and whitelisted; all database access parameterised via Prisma. |
| NFR-SEC-5 | Rate limits: global 100 req/min per IP; auth endpoints 5 req/15 min per IP+identifier; file presign 20/hour per user. |
| NFR-SEC-6 | Security headers via Helmet; CORS restricted to a configured allowlist; credentials mode explicit. |
| NFR-SEC-7 | No secret is present in the repository. Configuration is validated at boot; the process refuses to start with a missing or malformed secret. |
| NFR-SEC-8 | Dependency vulnerability scan in CI; a `high` or `critical` finding blocks the merge. |
| NFR-SEC-9 | Every privileged action is audited (actor, action, entity, diff, IP, timestamp). |
| NFR-SEC-10 | Uploaded files are content-type verified server-side and served from a domain distinct from the API. |

## 5. Maintainability

| ID | Requirement |
| --- | --- |
| NFR-M-1 | No source file exceeds 300 lines; no function exceeds 50 lines; cyclomatic complexity ≤ 10. Enforced by ESLint. |
| NFR-M-2 | TypeScript `strict: true`; `any` is banned outside third-party declaration merging. |
| NFR-M-3 | Feature modules are independent; a cycle between feature modules fails the build (`eslint-plugin-import/no-cycle`). |
| NFR-M-4 | Business rules live in services, never in controllers and never in Prisma callbacks. |
| NFR-M-5 | Every module has a `README.md` describing its responsibility, public surface and invariants. |
| NFR-M-6 | Documentation and code are updated in the same commit; a schema change without a `DATABASE.md` update fails review. |

## 6. Testability & Quality

| ID | Requirement |
| --- | --- |
| NFR-Q-1 | Global line coverage ≥ 80%; services and guards ≥ 90%; the booking state machine and the auth module 100% of branches. |
| NFR-Q-2 | Every endpoint has at least one e2e test covering the happy path and one covering the primary failure. |
| NFR-Q-3 | Integration tests run against a real PostgreSQL instance (Testcontainers), never a mock or SQLite. |
| NFR-Q-4 | Tests are deterministic and order-independent; a flaky test is treated as a failing test. |
| NFR-Q-5 | CI runs lint, typecheck, unit, integration and e2e on every pull request; all must pass to merge. |

## 7. Observability

| ID | Requirement |
| --- | --- |
| NFR-O-1 | Structured JSON logging (Pino) with level, timestamp, `requestId`, `userId`, route, latency, status. |
| NFR-O-2 | No credential, token, password or full payment-grade PII appears in logs; a redaction list is configured centrally. |
| NFR-O-3 | Every request carries an `X-Request-Id`, generated when absent, propagated to every log line and echoed to the client. |
| NFR-O-4 | Prometheus metrics at `/metrics` (protected): request rate, error rate, latency histogram, DB pool usage, job outcomes. |
| NFR-O-5 | Unhandled exceptions are reported to an error tracker with the request id and user id, but without request bodies. |
| NFR-O-6 | Business events (booking created, accepted, completed, master approved) are emitted as structured log lines suitable for analytics ingestion. |

## 8. Data Integrity

| ID | Requirement |
| --- | --- |
| NFR-D-1 | Every multi-write operation runs in a transaction. |
| NFR-D-2 | Invariants that can be expressed as database constraints are expressed as database constraints, not merely in application code. |
| NFR-D-3 | Booking acceptance uses `SERIALIZABLE` isolation, or an equivalent exclusion constraint, to prevent double-booking. |
| NFR-D-4 | Business entities are soft-deleted; hard deletion is limited to join rows and expired tokens. |
| NFR-D-5 | Money-like values are `Decimal(12,2)`; floating point is never used for prices. |
| NFR-D-6 | All timestamps are `timestamptz` in UTC; timezone conversion happens only at the presentation boundary. |

## 9. Compliance & Privacy

| ID | Requirement |
| --- | --- |
| NFR-C-1 | Personal data is minimised: only what a booking requires is collected. |
| NFR-C-2 | A user may request export of their personal data (Phase 6 endpoint; the data model already supports it). |
| NFR-C-3 | Account deletion anonymises personal fields while preserving aggregate booking history for financial and reputational integrity. |
| NFR-C-4 | Audit logs are retained for 24 months; application logs for 90 days. |
| NFR-C-5 | Client contact details are disclosed to a master only after booking acceptance (data minimisation by design). |

## 10. Portability & Operability

| ID | Requirement |
| --- | --- |
| NFR-OP-1 | The full stack runs locally with `docker compose up` and a single `.env` file. |
| NFR-OP-2 | Configuration is environment-variable driven and schema-validated at boot; there are no hard-coded environment branches in business code. |
| NFR-OP-3 | The container image is multi-stage, runs as a non-root user, and contains no development dependencies. |
| NFR-OP-4 | The application is cloud-agnostic: no provider-specific SDK outside the storage adapter, which sits behind an interface. |
| NFR-OP-5 | A new engineer can go from clone to a running, seeded API in under 15 minutes following `DEPLOYMENT.md`. |
