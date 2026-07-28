# UstoGo — Project Overview

**Document type:** Foundational
**Status:** Approved
**Version:** 1.0.0
**Last updated:** 2026-07-29

---

## 1. What UstoGo Is

UstoGo is a production-grade, two-sided marketplace that connects **clients** who need home and professional services with **masters** (craftsmen) who provide them: electricians, plumbers, carpenters, appliance repair technicians, cleaners, tilers, painters, and similar trades.

The platform is not a directory. It owns the full transaction lifecycle:

```
discovery  →  selection  →  booking  →  execution  →  review  →  reputation
```

Reputation feeds back into discovery, which is the core flywheel of the product.

## 2. The Problem

| Side | Pain today |
| --- | --- |
| Client | No trustworthy way to find a vetted craftsman. Relies on word of mouth. No price transparency, no accountability, no recourse when work is bad. |
| Master | Depends on irregular referrals. No professional profile. No scheduling tooling. Reputation is not portable. |

UstoGo solves both sides with one artifact: a **verified, reviewable, bookable master profile**.

## 3. What This Repository Is

This repository contains the **backend only** — a REST API server built with NestJS, PostgreSQL and Prisma. It is the single system of record for:

- identity, authentication and authorization
- the master catalogue and its moderation workflow
- the service catalogue and pricing
- master availability and scheduling
- the booking lifecycle and its state machine
- reviews and rating aggregation
- notifications
- client ↔ master messaging
- administrative operations and audit

Web and mobile clients are separate projects and consume this API.

## 4. Scope Decisions (v1)

These are binding decisions. Changing them requires an explicit architecture decision record in `ARCHITECTURE.md`.

| Decision | Choice | Rationale |
| --- | --- | --- |
| Payments | **Off-platform.** Bookings carry price fields (agreed amount, currency), but money moves directly between client and master. | Removes PCI scope, licensing, escrow and payout complexity from v1. Payments are a Phase 4 roadmap item with the data model already prepared (see `ROADMAP.md`). |
| File storage | **S3-compatible object storage** (AWS S3 in production, MinIO locally) with presigned upload and download URLs. | Horizontally scalable, keeps binaries out of the application server and out of the database. |
| Chat | **Designed now, built later.** Full schema, REST contract and Socket.io gateway contract are specified in this documentation set; implementation lands after the core booking flow is complete and stable. | Chat has no value before bookings exist. Designing it now prevents a schema migration later. |
| API style | **REST only**, versioned at `/api/v1`. | Predictable, cacheable, trivially consumable by web and mobile. GraphQL is explicitly out of scope. |
| Multi-tenancy | Single tenant. | Not a requirement. |
| Localisation | Content fields carry a locale-aware structure for category names; all system messages are keyed error codes translated by the client. | Target market is multilingual. |

## 5. Actors

| Actor | Created by | Can self-register |
| --- | --- | --- |
| **Admin** | Manual database seed / CLI | ❌ Never. Registration endpoint does not exist for this role. |
| **Client** | Self-service registration | ✅ |
| **Master** | Self-service registration, then **admin approval required** before appearing in search | ✅ (registration), ❌ (activation) |

Full permission matrix: `USER_ROLES.md` and `AUTHORIZATION.md`.

## 6. Core Domain Objects

| Object | One-line definition |
| --- | --- |
| `User` | Authentication identity. Owns exactly one role and at most one profile. |
| `ClientProfile` | Consumer-side data for a `User` with role `CLIENT`. |
| `MasterProfile` | Provider-side data for a `User` with role `MASTER`, including moderation state and denormalised rating. |
| `Category` | Hierarchical taxonomy of trades (e.g. `Home Repair → Plumbing → Pipe replacement`). |
| `Service` | A concrete, priced offering published by one master inside one category. |
| `WorkingDay` / `ScheduleException` | Recurring weekly availability plus date-specific overrides. |
| `Booking` | A request from a client for a master's service at a point in time. Governed by a strict state machine. |
| `Review` | A rating and comment written by a client, permitted only against a completed booking. |
| `Conversation` / `Message` | Threaded messaging between a client and a master. |
| `Notification` | An in-app event delivered to a user. |
| `Banner` | Admin-managed promotional content surfaced by the clients. |
| `RefreshToken` | A hashed, rotating, revocable session credential. |
| `AuditLog` | Immutable record of privileged administrative actions. |

Full field-level specification: `DATABASE.md`. Relationship diagram: `ERD.md`.

## 7. Technology Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 22 LTS |
| Framework | NestJS 11 |
| Language | TypeScript 5.x, `strict: true` |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Auth | Passport + `passport-jwt`, JWT access & refresh tokens, bcrypt |
| Validation | `class-validator`, `class-transformer` |
| API docs | Swagger / OpenAPI 3.1 via `@nestjs/swagger` |
| Realtime | Socket.io (deferred, see §4) |
| Object storage | S3-compatible via AWS SDK v3 |
| Testing | Jest (unit), Supertest (e2e), Testcontainers (integration DB) |
| Tooling | ESLint, Prettier, Husky, commitlint |
| Containerisation | Docker, docker-compose |

## 8. Non-Negotiable Engineering Principles

1. **Documentation is the source of truth.** Code that contradicts the docs is a bug in one of them; reconcile before merging.
2. **One feature completely, then the next.** No half-built modules.
3. **No placeholders.** No `TODO: implement`, no stub returns, no fake data in production paths.
4. **Never trust client input.** Every request body, query and param passes a DTO with validation.
5. **Never leak secrets.** Password hashes, refresh tokens and internal IDs of other users never appear in a response payload.
6. **Files stay under 300 lines.** Beyond that, the abstraction is wrong.
7. **Soft delete by default** on every business entity.
8. **Every privileged action is audited.**

## 9. Documentation Map

| Question | Read |
| --- | --- |
| What are we building and why? | `PROJECT_OVERVIEW.md`, `BUSINESS_REQUIREMENTS.md` |
| What exactly must it do? | `SRS.md`, `FUNCTIONAL_REQUIREMENTS.md`, `FEATURES.md` |
| How fast / safe / available? | `NON_FUNCTIONAL_REQUIREMENTS.md` |
| Who can do what? | `USER_ROLES.md`, `AUTHORIZATION.md` |
| What does the user experience? | `USER_FLOW.md` |
| What does the data look like? | `DATABASE.md`, `ERD.md` |
| What endpoints exist? | `API.md`, `SWAGGER_GUIDE.md` |
| How do sessions work? | `AUTHENTICATION.md` |
| How do we handle bad input and failures? | `VALIDATION.md`, `ERROR_HANDLING.md` |
| How is the system structured? | `ARCHITECTURE.md`, `MODULES.md`, `FOLDER_STRUCTURE.md` |
| How do we write code here? | `CODING_STANDARDS.md`, `NAMING_CONVENTIONS.md`, `PROJECT_RULES.md` |
| How do we work? | `DEVELOPMENT_WORKFLOW.md`, `TESTING.md`, `DEPLOYMENT.md` |
| What's done and what's next? | `STATUS.md`, `ROADMAP.md`, `TODO.md`, `BACKLOG.md`, `CHANGELOG.md` |
| How does the AI agent operate here? | `CLAUDE.md` |
