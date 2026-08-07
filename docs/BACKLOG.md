# Backlog — UstoGo Backend

**Last updated:** 2026-08-07

Ideas and requirements that are **not** in the v1 roadmap. Nothing here is scheduled. Items are promoted to `ROADMAP.md` only by an explicit product decision.

Priority: **P1** likely next after v1 · **P2** valuable, unscheduled · **P3** speculative
Size: **S** ≤ 3 days · **M** ≤ 2 weeks · **L** ≤ 6 weeks · **XL** a quarter or more

---

## Payments & Monetisation

| ID   | Item                                | Priority | Size | Notes                                                                                                                                                          |
| ---- | ----------------------------------- | -------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | In-platform payments                | P1       | XL   | Card acquiring, provider integration, PCI scope assessment. The booking model already carries price, priceType and currency, so the schema change is additive. |
| B-02 | Escrow / hold-and-release           | P1       | L    | Funds held at acceptance, released after completion. Depends on B-01.                                                                                          |
| B-03 | Platform commission                 | P1       | M    | Percentage or flat fee per booking; needs a ledger table. Depends on B-01.                                                                                     |
| B-04 | Master payouts                      | P1       | L    | Payout schedule, bank details, reconciliation, tax reporting. Depends on B-01.                                                                                 |
| B-05 | Refunds and partial refunds         | P1       | M    | Tied to the cancellation policy. Depends on B-01.                                                                                                              |
| B-06 | Master subscription tiers           | P2       | L    | Paid tiers with higher visibility and lower commission.                                                                                                        |
| B-07 | Paid promotion / featured placement | P2       | M    | Ranking boost with clear disclosure in results.                                                                                                                |

**Why deferred:** payments introduce regulatory, licensing and reconciliation complexity that would delay proving the core loop by months. The v1 data model deliberately leaves room for them.

---

## Trust & Safety

| ID   | Item                                                                                  | Priority | Size |
| ---- | ------------------------------------------------------------------------------------- | -------- | ---- |
| B-10 | Automated identity verification (document + liveness)                                 | P1       | L    |
| B-11 | Background / licence checks per trade                                                 | P2       | L    |
| B-12 | Dispute arbitration workflow (open → evidence → decision)                             | P1       | L    |
| B-13 | Review fraud detection (pattern and velocity analysis)                                | P2       | M    |
| B-14 | Report-and-block between users                                                        | P1       | S    |
| B-15 | ~~Master reliability score~~ — **done**, `MasterProfile.reliabilityScore` (STATUS.md) | P2       | M    |
| B-16 | Insurance / guarantee programme                                                       | P3       | XL   |

---

## Discovery & Matching

| ID   | Item                                                                                                                           | Priority | Size | Notes                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ---- | --------------------------------------------------------------------------------------------------------- |
| B-20 | PostGIS geolocation search                                                                                                     | P1       | M    | "Masters within 5 km" with a real spatial index; v1 stores coordinates but does not index them spatially. |
| B-21 | Personalised ranking                                                                                                           | P2       | L    | Learn from booking outcomes rather than sorting by rating alone.                                          |
| B-22 | Saved searches with alerts                                                                                                     | P3       | M    |                                                                                                           |
| B-23 | Favourites / shortlist                                                                                                         | P2       | S    |                                                                                                           |
| B-24 | ~~Instant-book~~ — **done**, opt-in via `PATCH /masters/me/instant-book`, gated on B-15's `reliabilityScore >= 90` (STATUS.md) | P2       | M    |
| B-25 | Reverse marketplace: client posts a job, masters bid                                                                           | P2       | XL   | A second, distinct product surface.                                                                       |
| B-26 | Elasticsearch / OpenSearch migration                                                                                           | P3       | L    | Only if PostgreSQL FTS stops meeting NFR-P-2.                                                             |

---

## Communication

| ID   | Item                                                                                                                                             | Priority | Size |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---- |
| B-30 | Push notifications (FCM/APNs)                                                                                                                    | P1       | M    |
| B-31 | SMS notifications for critical booking events                                                                                                    | P2       | S    |
| B-32 | Email digests                                                                                                                                    | P3       | S    |
| B-33 | In-app voice/video calls                                                                                                                         | P3       | XL   |
| B-34 | Number masking for calls                                                                                                                         | P2       | M    |
| B-35 | ~~Chat templates and quick replies~~ — **done**, `masters/me/quick-replies` (STATUS.md)                                                          | P3       | S    |
| B-36 | ~~Notification preferences~~ — **done, scoped to type** (no push/SMS channel to gate independently yet), `notifications/preferences` (STATUS.md) | P2       | M    |

---

## Master Tooling

| ID   | Item                                                                                                                             | Priority | Size |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- |
| B-40 | ~~Calendar sync~~ — **partially done**: one-time `.ics` export (`bookings/me/schedule.ics`), not a live CalDAV subscription feed | P2       | M    |
| B-41 | Earnings and analytics dashboard                                                                                                 | P2       | M    |
| B-42 | Team accounts (a company with several craftsmen)                                                                                 | P2       | XL   |
| B-43 | Recurring bookings                                                                                                               | P3       | M    |
| B-44 | ~~Quote/estimate flow before booking~~ — **done**, `/quotes` (STATUS.md)                                                         | P2       | L    |
| B-45 | ~~Portfolio gallery~~ — **done**, `masters/me/portfolio` (STATUS.md)                                                             | P2       | S    |
| B-46 | Holiday mode (temporary invisibility without deactivation)                                                                       | P1       | S    |

---

## Client Experience

| ID   | Item                                                                                                    | Priority | Size |
| ---- | ------------------------------------------------------------------------------------------------------- | -------- | ---- |
| B-50 | ~~Multiple saved addresses~~ — **done**, `users/me/addresses` (STATUS.md)                               | P1       | S    |
| B-51 | ~~Booking rescheduling~~ — **done**, `POST /bookings/:id/reschedule` (STATUS.md)                        | P1       | M    |
| B-52 | ~~Referral programme~~ — **done**, `GET /me/referral`, `?referralCode=` at registration (STATUS.md)     | P2       | M    |
| B-53 | Loyalty/repeat-booking incentives                                                                       | P3       | M    |
| B-54 | ~~Photo attachments on a booking request~~ — **done**, `attachmentKeys` on `POST /bookings` (STATUS.md) | P2       | S    |
| B-55 | Multi-language content (category and service translations)                                              | P2       | L    |

---

## Platform & Engineering

| ID   | Item                                                       | Priority | Size | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------- | -------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-60 | Redis response caching for the category tree and search    | P2       | S    |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-61 | Read replicas for search traffic                           | P3       | M    | Only when read load justifies it.                                                                                                                                                                                                                                                                                                                                                                                                |
| B-62 | Event sourcing for bookings                                | P3       | XL   | `BookingStatusHistory` already provides the audit value at a fraction of the cost.                                                                                                                                                                                                                                                                                                                                               |
| B-63 | GraphQL gateway                                            | P3       | L    | Only if client over-fetching becomes a measured problem.                                                                                                                                                                                                                                                                                                                                                                         |
| B-64 | Service extraction (search or chat)                        | P3       | XL   | Module boundaries are drawn to make this mechanical if ever needed.                                                                                                                                                                                                                                                                                                                                                              |
| B-65 | OpenTelemetry distributed tracing                          | P2       | M    |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-66 | Public partner API with API keys and quotas                | P3       | L    |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-67 | Feature flags                                              | P2       | S    |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-68 | Blue/green deployments                                     | P2       | M    |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-69 | Automated database restore verification                    | P2       | M    |                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-74 | Database-level enforcement of the role ↔ profile invariant | P2       | S    | `DATABASE.md` §3.1 requires that a user has at most one `ClientProfile` **or** one `MasterProfile`, matching `role`. A `CHECK` cannot span tables, so v1 enforces it in `AuthService` at registration. The database-level form is a `UNIQUE (id, role)` on `users` plus a redundant `role` column on each profile carrying a composite foreign key — a real guarantee, at the cost of one denormalised column per profile table. |
| B-75 | Slim the runtime image                                     | P2       | S    | The image grew from 259 MB to 616 MB when Prisma landed, almost entirely the query engine plus `@prisma/client`. Pinning `binaryTargets` to `linux-musl-openssl-3.0.x` alone, and pruning the engines the image cannot use, should recover most of it. Larger images mean slower rollouts and more registry storage; nothing is broken, so this is not urgent.                                                                   |
| B-76 | Durable outbound mail queue                                | P2       | M    | `MailService` retries three times in process and logs a failure. A message lost to a restart is a password-reset link that never arrives, and the user simply tries again — tolerable at v1 volume, not once mail carries booking notifications. Needs a broker; overlaps with B-60.                                                                                                                                             |

---

## Compliance

| ID   | Item                                     | Priority | Size |
| ---- | ---------------------------------------- | -------- | ---- |
| B-70 | Full GDPR-style data export self-service | P1       | M    | A synchronous v1 slice landed in Phase 6 (`GET /users/me/export`, `STATUS.md`); this item is now scoped to an async/downloadable export job, not the base capability. |
| B-71 | Cookie/consent management for clients    | P2       | S    |
| B-72 | Data retention automation per category   | P2       | M    |
| B-73 | Tax document generation for masters      | P2       | L    |

---

## Promotion Criteria

An item moves from backlog to roadmap only when:

1. There is evidence it matters — a metric, a support pattern, or a stated user need
2. Its dependencies are already delivered
3. Its data-model impact has been assessed against `DATABASE.md`
4. It fits a phase without displacing an in-flight feature
5. Product and engineering both agree on the scope

Adding an item here is free and encouraged. Starting one without going through this gate violates `PROJECT_RULES.md`.
