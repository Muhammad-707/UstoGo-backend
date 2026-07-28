# UstoGo — Backend

A production-grade REST API for a two-sided marketplace connecting **clients** who need home and professional services with **masters** (craftsmen) who provide them.

**Stack:** NestJS 11 · TypeScript (strict) · PostgreSQL 16 · Prisma 6 · Passport JWT · class-validator · Swagger · S3-compatible storage

---

## Status

**Phase 1 in progress — Platform Foundation.** The repository scaffold has landed: the application boots on `http://localhost:3000/api/v1` with strict TypeScript, the full lint rule set and git hooks in place. No routes are exposed yet.

The full specification lives in [`docs/`](./docs) and is the source of truth for this project. Current state and the next task: [`docs/STATUS.md`](./docs/STATUS.md) · [`docs/TODO.md`](./docs/TODO.md).

---

## Documentation

| Question                             | Document                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| What are we building and why?        | [PROJECT_OVERVIEW](./docs/PROJECT_OVERVIEW.md) · [BUSINESS_REQUIREMENTS](./docs/BUSINESS_REQUIREMENTS.md)                                            |
| What exactly must it do?             | [SRS](./docs/SRS.md) · [FUNCTIONAL_REQUIREMENTS](./docs/FUNCTIONAL_REQUIREMENTS.md) · [FEATURES](./docs/FEATURES.md)                                 |
| How fast, safe, available?           | [NON_FUNCTIONAL_REQUIREMENTS](./docs/NON_FUNCTIONAL_REQUIREMENTS.md)                                                                                 |
| Who can do what?                     | [USER_ROLES](./docs/USER_ROLES.md) · [AUTHORIZATION](./docs/AUTHORIZATION.md)                                                                        |
| What does the user experience?       | [USER_FLOW](./docs/USER_FLOW.md)                                                                                                                     |
| What does the data look like?        | [DATABASE](./docs/DATABASE.md) · [ERD](./docs/ERD.md)                                                                                                |
| What endpoints exist?                | [API](./docs/API.md) · [SWAGGER_GUIDE](./docs/SWAGGER_GUIDE.md)                                                                                      |
| How do sessions work?                | [AUTHENTICATION](./docs/AUTHENTICATION.md) · [SECURITY](./docs/SECURITY.md)                                                                          |
| How are inputs and failures handled? | [VALIDATION](./docs/VALIDATION.md) · [ERROR_HANDLING](./docs/ERROR_HANDLING.md)                                                                      |
| How is the system structured?        | [ARCHITECTURE](./docs/ARCHITECTURE.md) · [MODULES](./docs/MODULES.md) · [FOLDER_STRUCTURE](./docs/FOLDER_STRUCTURE.md)                               |
| How do we write code here?           | [CODING_STANDARDS](./docs/CODING_STANDARDS.md) · [NAMING_CONVENTIONS](./docs/NAMING_CONVENTIONS.md) · [PROJECT_RULES](./docs/PROJECT_RULES.md)       |
| How do we work?                      | [DEVELOPMENT_WORKFLOW](./docs/DEVELOPMENT_WORKFLOW.md) · [TESTING](./docs/TESTING.md) · [DEPLOYMENT](./docs/DEPLOYMENT.md)                           |
| What's done and what's next?         | [STATUS](./docs/STATUS.md) · [ROADMAP](./docs/ROADMAP.md) · [TODO](./docs/TODO.md) · [BACKLOG](./docs/BACKLOG.md) · [CHANGELOG](./docs/CHANGELOG.md) |

---

## Quick Start (once Phase 1 lands)

```bash
cp .env.example .env
npm ci
docker compose up -d          # postgres · minio · redis · mailpit
npm run prisma:migrate:dev
npm run prisma:seed
npm run start:dev
```

- API — http://localhost:3000/api/v1
- Swagger — http://localhost:3000/api/docs

Full setup and operations: [DEPLOYMENT.md](./docs/DEPLOYMENT.md).

---

## Core Domain in One Screen

**Roles:** `ADMIN` (seeded, never self-registers) · `CLIENT` · `MASTER` (self-registers, requires admin approval)

**The loop:** discovery → selection → booking → execution → review → reputation → discovery

**Booking states**

```
PENDING ──► ACCEPTED ──► IN_PROGRESS ──► COMPLETED
   │            │
   ├─► REJECTED ├─► CANCELLED_BY_MASTER
   ├─► EXPIRED  ├─► CANCELLED_BY_CLIENT
   └─► CANCELLED_BY_CLIENT
                └─► CANCELLED_BY_ADMIN
```

**Invariants the system guarantees**

- No admin registration endpoint exists anywhere
- A master is invisible in search until an admin approves them
- Exactly one review per completed booking — reviews cannot exist without a booking
- No overlapping accepted bookings for a master — enforced by a database exclusion constraint
- A client's phone and address reach a master only after the booking is accepted
- Every privileged action is written to an append-only audit log

---

## Contributing

Read [`PROJECT_RULES.md`](./docs/PROJECT_RULES.md) and [`DEVELOPMENT_WORKFLOW.md`](./docs/DEVELOPMENT_WORKFLOW.md) first. In short: documentation is the source of truth, one feature at a time, no placeholders, and the tracking documents are updated in the same commit as the code.

AI agents working in this repository: start with [`CLAUDE.md`](./CLAUDE.md).
