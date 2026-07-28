# UstoGo Backend

> **Read `docs/CLAUDE.md` before doing anything.** It is the agent operating manual for this repository.

## Non-negotiables

1. **`docs/` is the source of truth.** Read it before writing code. If code and docs disagree, reconcile before proceeding.
2. **One feature at a time**, in the order given by `docs/ROADMAP.md` and `docs/TODO.md`.
3. **No placeholders, no stubs, no `TODO` comments** in merged code.
4. **Every input validated**, every endpoint authorized, every error documented.
5. **Update `STATUS.md`, `TODO.md`, `CHANGELOG.md`** in the same commit as the code.

## Session commands

- `START` → read `STATUS.md` + `TODO.md`, continue from the first unchecked task, keep going.
- `STOP` → finish the current task, lint, test, update tracking docs, conventional commit, push.

## Where to look

| Question | Document |
| --- | --- |
| What are we building? | `docs/PROJECT_OVERVIEW.md` |
| What must it do? | `docs/FUNCTIONAL_REQUIREMENTS.md`, `docs/SRS.md` |
| What's the data model? | `docs/DATABASE.md`, `docs/ERD.md` |
| What endpoints exist? | `docs/API.md` |
| Who can do what? | `docs/USER_ROLES.md`, `docs/AUTHORIZATION.md` |
| How is it structured? | `docs/ARCHITECTURE.md`, `docs/MODULES.md`, `docs/FOLDER_STRUCTURE.md` |
| How do I write code here? | `docs/CODING_STANDARDS.md`, `docs/NAMING_CONVENTIONS.md` |
| What's next? | `docs/STATUS.md`, `docs/TODO.md` |

## Stack

NestJS 11 · TypeScript (strict) · PostgreSQL 16 · Prisma 6 · Passport JWT · bcrypt · class-validator · Swagger · S3-compatible storage · Socket.io (Phase 5)

## Current state

Phase 0 complete — documentation baseline. **No application code yet.** Phase 1 (Platform Foundation) is next; see `docs/TODO.md`.
