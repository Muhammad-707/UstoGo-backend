# Project Rules — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

These rules are binding on every contributor, human or agent. They are short on purpose: a rule nobody remembers is not a rule.

---

## 1. Documentation Is the Source of Truth

1. Read the relevant documents in `docs/` **before** writing code.
2. When code and documentation disagree, stop and reconcile them. Do not silently follow the code.
3. A change to behaviour ships with the documentation change **in the same commit**. Not the next commit, not the next PR.
4. `DATABASE.md`, `API.md` and `ERROR_HANDLING.md` are contracts. Changing one without updating the document is a defect.
5. `STATUS.md`, `TODO.md`, `ROADMAP.md` and `CHANGELOG.md` are updated when a feature completes.

---

## 2. One Feature at a Time

1. Features are implemented in the order set by `ROADMAP.md` and `FEATURES.md`.
2. A feature is not started until its dependencies are **Done**.
3. A feature is Done only when it meets every item in the Definition of Done (`ROADMAP.md`).
4. Starting a second feature while the first is incomplete is prohibited. Two half-features have less value than one finished one, and considerably more risk.
5. Work discovered mid-feature that is out of scope goes to `BACKLOG.md`.

---

## 3. No Fake Work

Prohibited without exception:

- Placeholder implementations that return hard-coded values
- `throw new Error('Not implemented')` in merged code
- `TODO` / `FIXME` comments — unfinished work goes to `TODO.md` where it is visible
- Commented-out code
- Endpoints that exist in Swagger but not in behaviour
- Tests that assert nothing, or that are skipped without a linked issue
- Mock data in a production code path

If something cannot be finished now, do not merge a shell of it. Merge less, finished.

---

## 4. Quality Gates Are Not Negotiable

| Gate | Threshold |
| --- | --- |
| File length | ≤ 300 lines |
| Function length | ≤ 50 lines |
| Cyclomatic complexity | ≤ 10 |
| `any` | 0 |
| Module cycles | 0 |
| Coverage | ≥ 80% global; ≥ 90% services/guards; 100% branches on auth and the booking state machine |
| Queries per request | ≤ 10 |
| Lint / typecheck / audit | clean |

A pull request that fails a gate is not reviewed until it is green. Review attention is for design, not for catching what a machine catches.

---

## 5. Security Is Not a Phase

1. Every input is validated by a DTO. No exceptions.
2. Every endpoint is protected by default; `@Public()` is explicit and justified.
3. Ownership is verified in the service layer; foreign resources return `404`, not `403`.
4. No entity is returned directly from a controller — always a response DTO.
5. No secret, token, hash or PII in a log line.
6. Every privileged mutation is audited.
7. New dependencies require a stated rationale and a clean audit.

---

## 6. Data Integrity Is Not Optional

1. Multi-table writes run in a transaction.
2. Invariants expressible as database constraints are expressed as database constraints.
3. Business entities are soft-deleted.
4. Money is `Decimal`, never `Float`.
5. Timestamps are `timestamptz` in UTC.
6. Denormalised aggregates are written in the same transaction as their source, and reconciled nightly.

---

## 7. Change Control

**Requires explicit approval before starting:**
- Changing the architecture or layering
- Renaming or removing a module
- Adding a runtime dependency
- Changing the database schema in a non-additive way
- Breaking an existing API contract
- Changing an ADR

**Never:**
- Delete existing code without understanding why it exists
- Break a public API in a patch or minor release
- Bypass a quality gate with an inline disable and no justification
- Push directly to `main`

---

## 8. Git Discipline

1. Branch per feature: `feat/<short-description>`.
2. Conventional Commits, imperative subject ≤ 72 chars, enforced by commitlint.
3. Commit bodies explain **why**, not what.
4. One logical change per commit; unrelated formatting is a separate commit.
5. Rebase before merge; keep history readable.
6. `main` is always deployable.

---

## 9. Code Review

**The author** ensures CI is green, the description explains the why, the documentation is updated, and any `@Public()` or lint-disable is justified in the description.

**The reviewer** checks:
- Does it match the documented requirement?
- Are authorization and validation correct?
- Are the transaction boundaries right?
- Are the failure paths handled and tested?
- Is anything leaked in a response or a log?
- Would a new engineer understand this in six months?

Reviewers approve designs, not diffs. "Looks fine" without reading the requirement is not a review.

---

## 10. Working Sessions

**Starting** (`/start`): read `CLAUDE.md`, `STATUS.md`, `TODO.md` and the documents relevant to the next task. Confirm what is done. Continue from the first unchecked item. Do not restart completed work. Do not ask questions already answered in `docs/`.

**Ending** (`/stop`): finish the current task completely or revert it. Run lint and tests. Update `STATUS.md`, `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`. Commit conventionally. Push if a remote exists.

Never end a session with the working tree in a broken state.

---

## 11. Communication

1. Ask when the requirement is genuinely ambiguous **and** the answer is not in `docs/`.
2. Do not ask what the documentation already answers.
3. Surface blockers immediately in `STATUS.md` §6 — a blocker discovered late is a blocker that cost a week.
4. Record decisions where they will be found again: ADRs in `ARCHITECTURE.md`, business rules in `BUSINESS_REQUIREMENTS.md`.

---

## 12. The Standard

Every file should read as though a senior engineer wrote it deliberately:

- The name says what it is
- The structure follows the documented conventions
- The failure paths are handled
- The tests describe the behaviour
- The comments explain the non-obvious
- Nothing is left half-done

Quality over speed. A shortcut taken today is paid for with interest by whoever reads this code next — and that is usually you.
