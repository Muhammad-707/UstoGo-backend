# Business Requirements — UstoGo

**Document type:** Business
**Version:** 1.0.0
**Last updated:** 2026-07-29

---

## 1. Vision

> Make hiring a trusted craftsman as ordinary and low-risk as ordering a taxi.

## 2. Business Objectives

| ID | Objective | Success measure |
| --- | --- | --- |
| BO-1 | Build a supply base of verified masters | ≥ 500 approved masters within 6 months of launch |
| BO-2 | Make discovery reliable | ≥ 70% of searches end in a master profile view |
| BO-3 | Convert discovery into bookings | ≥ 15% of profile views produce a booking request |
| BO-4 | Keep masters responsive | ≥ 80% of booking requests answered within 2 hours |
| BO-5 | Build a trustworthy reputation layer | ≥ 40% of completed bookings receive a review |
| BO-6 | Protect quality | < 2% of completed bookings result in a dispute |

Backend implication: every one of these metrics must be derivable from the database without external instrumentation. This is why `BookingStatusHistory` and timestamped state transitions are mandatory, not optional.

## 3. Stakeholders

| Stakeholder | Interest |
| --- | --- |
| Client | Find a competent master quickly, at a known price, with recourse. |
| Master | Steady, qualified demand; a professional profile; control over schedule. |
| Admin / Operations | Moderate supply quality, resolve disputes, curate the catalogue, monitor health. |
| Engineering | A maintainable, secure, scalable system. |

## 4. Business Rules

Business rules are normative. Each has a stable identifier and is referenced from `FUNCTIONAL_REQUIREMENTS.md` and enforced in a named service.

### 4.1 Identity and Accounts

| ID | Rule |
| --- | --- |
| BR-1 | Email is globally unique across all roles. Phone number is globally unique when present. |
| BR-2 | A `User` has exactly one role, fixed at creation. Role cannot be changed via the API. |
| BR-3 | Admin accounts are never created through a public endpoint. They are seeded by an operator-run CLI command. |
| BR-4 | A user may be `ACTIVE`, `INACTIVE` (self- or admin-deactivated) or `BLOCKED` (admin sanction). Only `ACTIVE` users may authenticate. |
| BR-5 | Deleting an account is a soft delete. Historical bookings and reviews remain, with the author displayed as a redacted placeholder. |

### 4.2 Master Onboarding and Moderation

| ID | Rule |
| --- | --- |
| BR-10 | A newly registered master has `approvalStatus = PENDING` and is invisible in public search. |
| BR-11 | A master cannot publish services or receive bookings until `approvalStatus = APPROVED`. |
| BR-12 | Only an admin may transition `approvalStatus`. Every transition is audited with actor, timestamp and reason. |
| BR-13 | Rejection requires a reason. A rejected master may edit their profile and resubmit; resubmission returns the profile to `PENDING`. |
| BR-14 | An approved master may be deactivated by an admin. Deactivation hides them from search and blocks new bookings, but does not cancel bookings already `ACCEPTED` — those must be resolved explicitly. |
| BR-15 | A master must belong to at least one category and publish at least one service before they can be approved. |

### 4.3 Catalogue

| ID | Rule |
| --- | --- |
| BR-20 | Categories form a tree of maximum depth 3. Only leaf categories may be attached to services. |
| BR-21 | Only admins create, rename, reorder or deactivate categories. |
| BR-22 | A category with attached active services cannot be hard-deleted; it can only be deactivated. |
| BR-23 | A service belongs to exactly one master and exactly one leaf category. |
| BR-24 | A service price is expressed as one of `FIXED`, `HOURLY`, or `FROM` (starting price). Currency is fixed per deployment. |

### 4.4 Availability

| ID | Rule |
| --- | --- |
| BR-30 | A master defines recurring weekly availability as `WorkingDay` records (weekday, start time, end time). |
| BR-31 | A master may override any specific date with a `ScheduleException` (full day off, or a modified window). |
| BR-32 | A booking may only be requested for a slot inside the master's effective availability for that date. |
| BR-33 | A master cannot hold two `ACCEPTED` bookings whose time ranges overlap. This is enforced in a transaction at acceptance time, not at request time. |
| BR-34 | All times are stored in UTC. The master's IANA timezone is stored on the profile and used to compute availability windows. |

### 4.5 Booking Lifecycle

| ID | Rule |
| --- | --- |
| BR-40 | A booking is created by a client in state `PENDING`. |
| BR-41 | The master may move `PENDING → ACCEPTED` or `PENDING → REJECTED`. Rejection requires a reason. |
| BR-42 | A client may cancel while `PENDING` or `ACCEPTED`. Cancelling an `ACCEPTED` booking less than 3 hours before start is recorded as a late cancellation on the client's record. |
| BR-43 | A master may cancel an `ACCEPTED` booking with a reason; this is recorded against the master's reliability metrics. |
| BR-44 | Only the master may mark a booking `IN_PROGRESS` and then `COMPLETED`. |
| BR-45 | A `PENDING` booking whose scheduled start time has passed is automatically `EXPIRED` by a scheduled job. |
| BR-46 | Every state transition writes a `BookingStatusHistory` row with actor, from-state, to-state, reason and timestamp. Booking history is append-only. |
| BR-47 | Terminal states (`COMPLETED`, `REJECTED`, `EXPIRED`, `CANCELLED_BY_*`) admit no further transitions. |

### 4.6 Reviews and Rating

| ID | Rule |
| --- | --- |
| BR-50 | A review may only be created by the client of a booking in state `COMPLETED`. |
| BR-51 | Exactly one review per booking. Enforced by a unique constraint on `bookingId`. |
| BR-52 | A review must be submitted within 30 days of completion. |
| BR-53 | Rating is an integer 1–5. Comment is optional, maximum 2000 characters. |
| BR-54 | A client may edit their review within 24 hours of submission; after that it is immutable. |
| BR-55 | The master's `ratingAverage` and `ratingCount` are denormalised on `MasterProfile` and recalculated inside the same transaction that writes the review. |
| BR-56 | An admin may hide a review that violates policy. Hidden reviews are excluded from aggregates, and aggregates are recomputed on hide/unhide. |
| BR-57 | A master may post exactly one public reply per review. |

### 4.7 Messaging

| ID | Rule |
| --- | --- |
| BR-60 | A conversation exists between exactly one client and one master. |
| BR-61 | A conversation may only be opened if the two parties share at least one booking that is not in state `EXPIRED`. |
| BR-62 | Messages are immutable once sent; a sender may soft-delete their own message ("deleted for everyone" semantics). |
| BR-63 | Admins may read conversation content only in the context of an open dispute, and every such read is audited. |

### 4.8 Notifications

| ID | Rule |
| --- | --- |
| BR-70 | Every booking state transition produces a notification for the counterparty. |
| BR-71 | Master approval and rejection produce a notification for the master. |
| BR-72 | Notifications are persisted, per-user, and individually markable as read. |
| BR-73 | A user may never read another user's notifications, including admins via the standard endpoints. |

### 4.9 Administration

| ID | Rule |
| --- | --- |
| BR-80 | Admins may read and moderate all data, but may not impersonate users or read passwords. |
| BR-81 | Every admin write action produces an `AuditLog` entry: actor, action, entity type, entity id, before/after diff, IP, timestamp. |
| BR-82 | Audit logs are append-only and are never exposed to non-admin roles. |

## 5. Out of Scope for v1

- In-platform payments, escrow, commissions and payouts
- Automated identity/background verification of masters
- Dispute arbitration workflow beyond flagging
- Master subscription tiers and paid promotion
- Public REST API for third parties
- Multi-currency

Each of these is tracked in `BACKLOG.md`.

## 6. Assumptions

- Masters own smartphones and can respond within hours.
- One deployment serves one country / one currency / one primary timezone set.
- Service delivery happens at the client's address; the platform stores but does not verify addresses in v1.

## 7. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cold-start: no masters → no clients | Critical | Manual supply onboarding; admin tooling prioritised in Phase 2 of the roadmap. |
| Disintermediation (parties transact off-platform) | High | Reputation is the retention hook; v1 accepts this risk since payments are off-platform anyway. |
| Fake reviews | High | Reviews are strictly booking-gated (BR-50/51) — a review cannot exist without a completed booking. |
| Master no-shows | Medium | Cancellation and reliability metrics captured from day one via `BookingStatusHistory`. |
