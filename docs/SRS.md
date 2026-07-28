# Software Requirements Specification — UstoGo Backend

**Document type:** SRS (IEEE 830 inspired)
**Version:** 1.0.0
**Status:** Approved baseline
**Last updated:** 2026-07-29

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the complete requirements for the UstoGo backend: a REST API serving a two-sided marketplace for home and professional services. It is written for backend engineers, QA engineers and technical stakeholders, and it is the contract against which the implementation is verified.

### 1.2 Scope
The system provides identity and session management, a moderated master catalogue, a service and category catalogue, availability management, a booking lifecycle, a booking-gated review system, in-app notifications, client↔master messaging, and administrative tooling. It does **not** provide payment processing, front-end applications, or third-party API access in v1.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| Master | A craftsman / service provider. |
| Client | A consumer requesting a service. |
| Booking | A time-bound request from a client to a master for a specific service. |
| Approval | The admin moderation decision that makes a master publicly visible. |
| Slot | A contiguous time window derived from a master's availability. |
| Soft delete | Setting `deletedAt`; the row remains and is excluded from default queries. |
| Terminal state | A booking state from which no transition is legal. |

### 1.4 References
`BUSINESS_REQUIREMENTS.md`, `FUNCTIONAL_REQUIREMENTS.md`, `NON_FUNCTIONAL_REQUIREMENTS.md`, `DATABASE.md`, `API.md`, `AUTHENTICATION.md`, `AUTHORIZATION.md`, `SECURITY.md`, `ARCHITECTURE.md`.

### 1.5 Conventions
The key words **MUST**, **MUST NOT**, **SHOULD**, **MAY** are to be interpreted as in RFC 2119.

---

## 2. Overall Description

### 2.1 Product Perspective
UstoGo backend is a standalone, stateless HTTP service backed by PostgreSQL and S3-compatible object storage. Horizontal scaling is achieved by running N identical instances behind a load balancer. Session state lives entirely in the database (refresh tokens) and in signed JWTs — no server-side session affinity is required.

```
┌────────────┐   ┌────────────┐   ┌────────────┐
│  Web app   │   │ iOS/Android│   │  Admin UI  │
└─────┬──────┘   └─────┬──────┘   └─────┬──────┘
      └───────────┬────┴────────────────┘
                  │ HTTPS / REST (/api/v1)
          ┌───────▼────────┐
          │ Load balancer  │
          └───────┬────────┘
      ┌───────────┼───────────┐
┌─────▼────┐ ┌────▼─────┐ ┌───▼──────┐
│ API #1   │ │ API #2   │ │ API #n   │   NestJS, stateless
└─────┬────┘ └────┬─────┘ └───┬──────┘
      └───────────┼───────────┘
        ┌─────────┼──────────┬─────────────┐
   ┌────▼─────┐ ┌─▼────────┐ ┌▼──────────┐
   │PostgreSQL│ │ S3 / MinIO│ │Scheduler  │
   └──────────┘ └───────────┘ └───────────┘
```

### 2.2 Product Functions
1. Account registration, authentication and session lifecycle
2. Master onboarding with admin moderation
3. Category and service catalogue management
4. Master availability configuration
5. Master discovery: search, filter, sort, paginate
6. Booking creation and lifecycle management
7. Booking-gated reviews and rating aggregation
8. In-app notifications
9. Client↔master messaging
10. Administrative moderation, banners, dashboard and audit

### 2.3 User Classes
See `USER_ROLES.md`. Summary: ADMIN (seeded, full moderation), CLIENT (self-registered, demand side), MASTER (self-registered, moderated, supply side).

### 2.4 Operating Environment
Node.js 22 LTS, PostgreSQL 16, Linux containers. Deployed via Docker. TLS terminates at the load balancer; the application MUST refuse to start in production without `NODE_ENV=production` and all required secrets present.

### 2.5 Design and Implementation Constraints
- NestJS 11 with feature-based modular architecture (`ARCHITECTURE.md`)
- Prisma 6 as the only database access path; raw SQL only for reporting queries, always parameterised
- UUID v4 primary keys on every table
- All timestamps stored as `timestamptz` in UTC
- No source file exceeds 300 lines
- TypeScript `strict` mode; `any` is prohibited outside declaration merging

### 2.6 Assumptions and Dependencies
- An SMTP provider is available for password reset and transactional email
- An S3-compatible endpoint is reachable from the API instances
- System clocks are NTP-synchronised

---

## 3. Specific Requirements

Requirement identifiers are stable. Format: `SRS-<AREA>-<n>`. Full acceptance criteria for each are in `FUNCTIONAL_REQUIREMENTS.md`.

### 3.1 Authentication (SRS-AUTH)

| ID | Requirement |
| --- | --- |
| SRS-AUTH-1 | The system MUST allow a visitor to register as CLIENT or MASTER with email, password, and role-appropriate profile fields. |
| SRS-AUTH-2 | The system MUST NOT expose any endpoint that creates an ADMIN account. |
| SRS-AUTH-3 | Passwords MUST be hashed with bcrypt, cost factor ≥ 12, and MUST never be returned in any response. |
| SRS-AUTH-4 | On successful login the system MUST issue a short-lived JWT access token and a long-lived opaque-to-client refresh token. |
| SRS-AUTH-5 | Refresh tokens MUST be stored hashed, MUST rotate on every use, and reuse of a consumed token MUST revoke the entire token family. |
| SRS-AUTH-6 | The system MUST support logout of the current device and logout of all devices. |
| SRS-AUTH-7 | The system MUST support password reset via a single-use, time-limited token delivered by email. |
| SRS-AUTH-8 | Changing a password MUST revoke all refresh tokens except the caller's current session. |
| SRS-AUTH-9 | Authentication responses MUST NOT reveal whether an email exists (uniform error for unknown email and wrong password). |
| SRS-AUTH-10 | Login MUST be rate-limited per IP and per email identifier. |

### 3.2 Users and Profiles (SRS-USER)

| ID | Requirement |
| --- | --- |
| SRS-USER-1 | A user MUST be able to read and update their own profile. |
| SRS-USER-2 | Avatar upload MUST go to object storage; the database stores a key, and responses expose a time-limited URL. |
| SRS-USER-3 | A master MUST be able to upload, list and delete certificates. |
| SRS-USER-4 | A user MUST be able to soft-delete their own account, which revokes all sessions. |
| SRS-USER-5 | Personal contact details of a client MUST NOT be exposed to a master before the booking is `ACCEPTED`. |

### 3.3 Master Moderation (SRS-MOD)

| ID | Requirement |
| --- | --- |
| SRS-MOD-1 | A registered master MUST default to `approvalStatus = PENDING`. |
| SRS-MOD-2 | An admin MUST be able to approve, reject (with reason), activate and deactivate masters. |
| SRS-MOD-3 | A master MUST NOT appear in public search unless `approvalStatus = APPROVED`, `isActive = true`, `user.status = ACTIVE` and `deletedAt IS NULL`. |
| SRS-MOD-4 | Approval MUST be rejected by the system if the master has no category or no active service (BR-15). |
| SRS-MOD-5 | Every moderation decision MUST write an audit log entry and notify the master. |

### 3.4 Categories and Services (SRS-CAT)

| ID | Requirement |
| --- | --- |
| SRS-CAT-1 | The system MUST expose the category tree publicly, with active categories only. |
| SRS-CAT-2 | Only admins MUST be able to mutate categories. |
| SRS-CAT-3 | Category depth MUST NOT exceed 3, and only leaf categories MUST accept services. |
| SRS-CAT-4 | A master MUST be able to perform full CRUD on their own services. |
| SRS-CAT-5 | Deleting a service MUST be a soft delete and MUST NOT affect existing bookings. |

### 3.5 Availability (SRS-SCH)

| ID | Requirement |
| --- | --- |
| SRS-SCH-1 | A master MUST be able to define weekly working days with start and end times. |
| SRS-SCH-2 | A master MUST be able to create date-specific exceptions (day off or altered window). |
| SRS-SCH-3 | The system MUST expose computed free slots for a master over a requested date range, excluding accepted bookings. |
| SRS-SCH-4 | Slot computation MUST respect the master's stored IANA timezone and MUST return UTC instants. |

### 3.6 Discovery (SRS-SEARCH)

| ID | Requirement |
| --- | --- |
| SRS-SEARCH-1 | The system MUST support master search by free text over display name, bio and service titles. |
| SRS-SEARCH-2 | The system MUST support filtering by category, city, minimum rating, price range, and availability on a date. |
| SRS-SEARCH-3 | The system MUST support sorting by rating, review count, price and creation date. |
| SRS-SEARCH-4 | All list endpoints MUST be paginated and MUST return total count and page metadata. |
| SRS-SEARCH-5 | A search response MUST NOT include any master's private contact details. |

### 3.7 Bookings (SRS-BOOK)

| ID | Requirement |
| --- | --- |
| SRS-BOOK-1 | A client MUST be able to create a booking for an approved, active master, a live service, and a slot inside availability. |
| SRS-BOOK-2 | The system MUST implement the booking state machine defined in `FUNCTIONAL_REQUIREMENTS.md` §7 and MUST reject illegal transitions with `409`. |
| SRS-BOOK-3 | Acceptance MUST be transactional and MUST prevent overlapping `ACCEPTED` bookings for the same master. |
| SRS-BOOK-4 | Every transition MUST append an immutable `BookingStatusHistory` record. |
| SRS-BOOK-5 | A scheduled job MUST expire `PENDING` bookings whose start time has passed. |
| SRS-BOOK-6 | Only participants of a booking and admins MUST be able to read it. |

### 3.8 Reviews (SRS-REV)

| ID | Requirement |
| --- | --- |
| SRS-REV-1 | A review MUST be creatable only by the client of a `COMPLETED` booking, at most once, within 30 days. |
| SRS-REV-2 | Rating MUST be an integer in [1,5]. |
| SRS-REV-3 | Master rating aggregates MUST be updated in the same transaction as the review write. |
| SRS-REV-4 | An admin MUST be able to hide a review, which MUST exclude it from aggregates. |
| SRS-REV-5 | A master MUST be able to reply once per review. |

### 3.9 Notifications (SRS-NOTIF)

| ID | Requirement |
| --- | --- |
| SRS-NOTIF-1 | The system MUST persist a notification for every booking transition, moderation decision and new message. |
| SRS-NOTIF-2 | A user MUST be able to list, filter by read state, mark read, and read an unread count. |
| SRS-NOTIF-3 | Notification payloads MUST use stable machine-readable type codes plus a data object, not pre-rendered prose. |

### 3.10 Messaging (SRS-CHAT) — designed in v1, implemented in Phase 5

| ID | Requirement |
| --- | --- |
| SRS-CHAT-1 | A conversation MUST be unique per (client, master) pair. |
| SRS-CHAT-2 | A conversation MUST only be creatable when the parties share a non-expired booking. |
| SRS-CHAT-3 | Message history MUST be paginated with a cursor. |
| SRS-CHAT-4 | The REST contract MUST be functionally complete without the WebSocket layer; the gateway is an optimisation, not a dependency. |

### 3.11 Administration (SRS-ADMIN)

| ID | Requirement |
| --- | --- |
| SRS-ADMIN-1 | Admin endpoints MUST live under `/api/v1/admin` and MUST be guarded by role. |
| SRS-ADMIN-2 | The system MUST provide dashboard aggregates as specified in `API.md`. |
| SRS-ADMIN-3 | Every admin mutation MUST write an `AuditLog` entry with a before/after diff. |
| SRS-ADMIN-4 | Audit logs MUST be append-only and MUST NOT be readable by non-admins. |
| SRS-ADMIN-5 | Admins MUST be able to manage banners with an active time window. |

### 3.12 Cross-cutting (SRS-X)

| ID | Requirement |
| --- | --- |
| SRS-X-1 | Every request body, query and path parameter MUST be validated by a DTO with a whitelist and forbidden non-whitelisted properties. |
| SRS-X-2 | Every error response MUST follow the single envelope defined in `ERROR_HANDLING.md`. |
| SRS-X-3 | Every endpoint MUST be documented in Swagger with request, response and error schemas. |
| SRS-X-4 | Every request MUST carry a correlation id, generated if absent, and echoed in the response and in logs. |
| SRS-X-5 | Logs MUST be structured JSON and MUST NOT contain credentials, tokens or full PII. |

---

## 4. Verification

Each requirement above maps to at least one automated test. The mapping is maintained in `TESTING.md` §7 (Requirement Traceability Matrix). A requirement without a test is treated as unimplemented regardless of the state of the code.
