# Development Workflow — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

---

## 1. Branching

```
main        ──●────────●────────●──        always deployable, tagged releases
               ╲      ╱ ╲      ╱
develop     ────●────●───●────●───         integration branch
                 ╲  ╱     ╲  ╱
feat/…      ──────●─        ●              short-lived feature branches
```

| Branch          | Purpose                              | Protection                                                      |
| --------------- | ------------------------------------ | --------------------------------------------------------------- |
| `main`          | Production                           | No direct pushes; PR + green CI + 1 approval; tagged on release |
| `develop`       | Integration; auto-deploys to staging | No direct pushes; PR + green CI                                 |
| `feat/<desc>`   | One feature                          | Branched from `develop`                                         |
| `fix/<desc>`    | Bug fix                              |                                                                 |
| `hotfix/<desc>` | Urgent production fix                | Branched from `main`, merged to both                            |
| `docs/<desc>`   | Documentation only                   |                                                                 |

Feature branches live **days, not weeks**. A long-lived branch is a merge conflict accruing interest.

---

## 2. The Feature Loop

```
1. READ      → docs relevant to the task; STATUS.md; TODO.md
2. PLAN      → confirm the requirement, list the files, identify the transaction boundaries
3. SCHEMA    → Prisma model + migration, if the feature needs one
4. DOMAIN    → pure logic first (state machines, calculators, policies) + unit tests
5. SERVICE   → business rules, transactions, events + unit tests
6. TRANSPORT → DTOs, controller, Swagger annotations
7. AUTHZ     → guards, ownership checks, field-level exposure
8. TEST      → integration + e2e + the six-case authorization matrix
9. VERIFY    → lint, typecheck, coverage, query count
10. DOCUMENT → API.md / DATABASE.md / ERROR_HANDLING.md / STATUS.md / TODO.md / CHANGELOG.md
11. COMMIT   → conventional commit
12. PR       → description explaining why, self-review, request review
```

Domain before service before transport is deliberate. Writing the controller first pulls HTTP concerns into the business logic; writing the pure logic first forces the interfaces to be clean, because at that point there is no framework to hide behind.

---

## 3. Daily Cycle

**Start of session**

```bash
git checkout develop && git pull
npm ci
docker compose up -d
npm run prisma:migrate:dev
```

Read `STATUS.md` and `TODO.md`. Pick the first unchecked item. Do not start something else because it looks more interesting.

**During**

- Small commits, each one leaving the tree green
- Run the relevant tests continuously (`npm run test:watch`)
- Anything out of scope goes to `BACKLOG.md`, not into the branch

**End of session**

```bash
npm run lint && npm run typecheck && npm test
# update STATUS.md / TODO.md / CHANGELOG.md
git add -A && git commit -m "feat(bookings): implement acceptance with overlap prevention"
git push -u origin feat/booking-acceptance
```

Never leave the tree broken overnight. Either finish the step or revert it.

---

## 4. Commits

```
<type>(<scope>): <imperative subject>

<why this change exists; what it enables or prevents>

<footer: refs, BREAKING CHANGE>
```

Types: `feat` `fix` `refactor` `perf` `test` `docs` `chore` `build` `ci`
Scopes: module names — `auth` `users` `masters` `bookings` `reviews` `db` `docs`

```
feat(bookings): prevent overlapping accepted bookings

Acceptance now runs in a SERIALIZABLE transaction and the bookings table
carries a GiST exclusion constraint over (master, time range) for accepted
and in-progress rows. Two masters accepting overlapping slots concurrently
previously both succeeded under READ COMMITTED.

Refs: #87
```

The body earns its place by answering the question a future reader will actually have: why does this code look like this?

---

## 5. Pull Requests

**Template**

```markdown
## What

One or two sentences.

## Why

The requirement (SRS-xxx / FR-xxx / BR-xx) this satisfies.

## How

Notable design decisions and anything a reviewer should look at closely.

## Testing

What was added; how the failure paths are covered.

## Documentation

Which documents changed.

## Checklist

- [ ] Matches the documented requirement
- [ ] Validation on every input
- [ ] Authorization enforced and tested (six-case matrix)
- [ ] Swagger complete including error codes
- [ ] Coverage thresholds met
- [ ] No file > 300 lines, no `any`, no TODOs
- [ ] Docs updated in this PR
- [ ] Conventional commits
```

**Size:** aim for under 400 changed lines. Beyond ~800, review quality collapses and approval becomes a formality. Split by layer or by sub-feature.

**Turnaround:** review within one working day. A PR waiting three days is a branch drifting three days out of date.

---

## 6. Review

Reviewers look for, in order:

1. **Correctness against the requirement** — does it do what `FUNCTIONAL_REQUIREMENTS.md` says, including the failure paths?
2. **Security** — authorization, validation, data exposure, logging
3. **Data integrity** — transaction boundaries, constraints, soft delete
4. **Design** — layering, module boundaries, testability
5. **Clarity** — naming, structure, comments that explain why
6. **Tests** — do they test behaviour, or do they test the implementation back to itself?

Comment conventions: `blocking:` must change · `suggestion:` optional · `question:` clarification · `nit:` cosmetic, non-blocking.

Be direct about problems and kind about people. Review the code, not the author.

---

## 7. Handling Bugs

1. Reproduce it.
2. **Write a failing test** that captures it.
3. Fix it.
4. Confirm the test passes.
5. Ask whether the same class of bug exists elsewhere.
6. Add a `Fixed` entry to `CHANGELOG.md`.

The failing test comes before the fix. Without it, there is no proof the bug is fixed and nothing preventing its return.

---

## 8. Hotfixes

```bash
git checkout main && git pull
git checkout -b hotfix/refresh-token-leak
# minimal fix + regression test
git commit -m "fix(auth): stop returning the raw refresh token in the error body"
# PR to main → deploy → tag → merge main back into develop
```

A hotfix is the smallest change that resolves the incident. Refactoring while firefighting is how a one-line fix becomes a second outage.

---

## 9. Database Changes

```bash
# 1. edit prisma/schema.prisma per DATABASE.md
npm run prisma:migrate:dev -- --name add_booking_overlap_exclusion

# 2. review the generated SQL — always
# 3. add raw SQL for anything Prisma cannot express (exclusion constraints, partial indexes)
# 4. verify it is backwards-compatible with the running release
# 5. update DATABASE.md and ERD.md in the same commit
# 6. add a CHANGELOG entry under Database
```

Checklist: indexes for every new query pattern · soft delete on business entities · FK delete behaviour explicit · expand/contract for anything destructive · reviewed generated SQL.

---

## 9a. Dependencies

Adding a runtime dependency requires a stated rationale and a clean audit (`PROJECT_RULES.md` §7).

**Regenerate `package-lock.json` inside Linux, not on your workstation:**

```bash
docker run --rm -v "$PWD:/app" -w /app node:22-alpine npm install --package-lock-only
```

npm records platform-specific optional dependencies, and it only records the ones it resolves on the platform it runs on. A lock generated on Windows or macOS can omit packages that the Linux image needs, and the failure surfaces as `npm ci` refusing the lock during `docker build` — not on the machine that wrote it. This has already happened once: the wasm32-wasi optional subtree of `unrs-resolver`, reached through `eslint-import-resolver-typescript`, needs hoisted `@emnapi` packages that a Windows resolve never writes down.

`npm ci` validates the **entire** lock before installing anything, so `--omit=dev` does not sidestep an inconsistency introduced by a development dependency.

---

## 10. Agent Sessions

When work is performed by an AI agent, the protocol in `CLAUDE.md` applies:

- `START` → read `CLAUDE.md`, `STATUS.md`, `TODO.md` and the relevant docs; continue from the first unchecked task; do not restart finished work
- `STOP` → finish the current task, run lint and tests, update the tracking documents, commit conventionally, push if a remote exists

The same standards apply regardless of who or what wrote the code. A pull request is judged by the code, not by its author.

---

## 11. Definition of Ready

A task is ready to start when:

- [ ] The requirement is documented and unambiguous
- [ ] Its dependencies are Done
- [ ] The data model impact is understood
- [ ] The API contract is specified
- [ ] Acceptance criteria are testable

If a task is not ready, make it ready — do not start it and discover the gaps halfway through.
