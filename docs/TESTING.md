# Testing Strategy — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

**Premise:** a requirement without a test is unimplemented, regardless of the state of the code.

---

## 1. The Pyramid, Applied

```
        ╱ E2E ╲          ~15%  full HTTP through a real database
      ╱─────────╲
    ╱ Integration ╲      ~25%  services + real PostgreSQL, no HTTP
  ╱─────────────────╲
╱       Unit         ╲   ~60%  pure logic, mocked collaborators
──────────────────────
```

Where each level earns its place:

| Level | Best at | Bad at |
| --- | --- | --- |
| Unit | Branch coverage of pure logic — state machine, availability calculator, policies | Proving anything about SQL, transactions or serialisation |
| Integration | Transactions, constraints, soft delete, concurrency, query correctness | Proving the HTTP contract |
| E2E | Authorization, status codes, response shape, the full user journey | Exhaustive branch coverage — too slow |

The booking state machine and the availability calculator are pure functions precisely so they can be exhaustively unit-tested. That is a design decision made for testability, not an accident.

---

## 2. Tooling

| Concern | Tool |
| --- | --- |
| Runner | Jest |
| HTTP | Supertest |
| Database | **Testcontainers with real PostgreSQL 16** |
| Object storage | MinIO container |
| Time | `jest.useFakeTimers()` / injected `Clock` |
| Data | Typed factory functions in `test/fixtures/` |

**No SQLite, no mocked Prisma client in integration tests.** SQLite has different transaction semantics, no `tsvector`, no exclusion constraints and different type coercion. Tests that pass against it prove nothing about production. Real PostgreSQL in a container costs a few seconds of startup and buys actual confidence.

---

## 3. Coverage Requirements

| Scope | Threshold |
| --- | --- |
| Global lines | ≥ 80% |
| Services | ≥ 90% |
| Guards & interceptors | ≥ 90% |
| `BookingStateMachine` | **100% branches** |
| `AuthService` + token rotation | **100% branches** |
| `AvailabilityCalculator` | **100% branches** |
| DTOs, constants, module files | excluded |

Enforced in `jest.config.ts`; CI fails below threshold. Coverage is a floor, not a goal — 100% coverage of trivial getters proves nothing, which is why the high bars sit on the three components where a bug is expensive.

---

## 4. Unit Tests

Colocated in `src/modules/<feature>/__tests__/`. All collaborators mocked.

```ts
describe('BookingStateMachine', () => {
  const machine = new BookingStateMachine();

  describe('assertCanTransition', () => {
    it('allows PENDING → ACCEPTED for the master', () => {
      expect(() => machine.assertCanTransition(booking('PENDING'), 'ACCEPTED', 'MASTER')).not.toThrow();
    });

    it('rejects PENDING → ACCEPTED for the client', () => {
      expect(() => machine.assertCanTransition(booking('PENDING'), 'ACCEPTED', 'CLIENT'))
        .toThrow(IllegalBookingTransitionException);
    });

    it.each(['COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_MASTER'] as const)(
      'treats %s as terminal',
      (terminal) => {
        for (const target of ALL_STATUSES) {
          expect(() => machine.assertCanTransition(booking(terminal), target, 'ADMIN')).toThrow();
        }
      },
    );
  });
});
```

The terminal-state test is table-driven across the full cross product — 9 statuses × 9 targets — because that is exactly the kind of matrix a human reviewer will not check by hand.

**Availability calculator cases:** no working days; a single window; multiple windows in a day; a day-off exception; an altered-window exception; a booking exactly at a boundary; a booking spanning two windows; DST transition forward; DST transition backward; the requested range crossing a month boundary; a service duration that does not divide the window evenly.

---

## 5. Integration Tests

Real database, real transactions, no HTTP layer.

```ts
describe('BookingTransitionService (integration)', () => {
  it('prevents two masters from accepting overlapping slots concurrently', async () => {
    const [a, b] = await Promise.allSettled([
      service.accept(bookingA.id, masterUser),
      service.accept(bookingB.id, masterUser), // overlaps A
    ]);

    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const rejected = [a, b].find((r) => r.status === 'rejected');
    expect(rejected.reason).toBeInstanceOf(BookingOverlapException);
  });

  it('recomputes master rating inside the review transaction', async () => { … });

  it('rolls back the review when the aggregate update fails', async () => { … });
});
```

Mandatory integration coverage:
- Transaction rollback on partial failure (registration, review + aggregate, booking + history)
- Soft delete invisibility across every read path
- Unique and check constraints firing as expected
- The booking overlap **exclusion constraint** rejecting a direct insert that bypasses service logic
- Concurrent refresh producing exactly one valid successor token
- Concurrent review creation on the same booking producing exactly one review

---

## 6. E2E Tests

Full HTTP through a booted application against a containerised database.

```ts
describe('POST /api/v1/bookings', () => {
  it('creates a booking and notifies the master', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(validPayload)
      .expect(201);

    expect(res.body).toMatchObject({ status: 'PENDING' });
    expect(res.body).not.toHaveProperty('master.user.passwordHash');
    await expectNotification(masterUserId, 'BOOKING_CREATED');
  });

  it('returns 409 SLOT_NOT_AVAILABLE for a taken slot', async () => { … });
  it('hides the client phone from the master until acceptance', async () => { … });
});
```

### The mandatory authorization matrix

Every protected endpoint runs six assertions, generated from a shared helper so the matrix cannot be forgotten:

```ts
describeAuthzMatrix({
  method: 'get',
  path: (ctx) => `/api/v1/bookings/${ctx.bookingId}`,
  allowedRoles: ['CLIENT', 'MASTER', 'ADMIN'],
  ownerContext: 'participant',
});
// asserts: 401 no token · 401 bad token · 403 wrong role
//          404 foreign resource · 200 owner · no over-exposed fields
```

### Journey tests

One test per complete user journey from `USER_FLOW.md`:
- Master onboarding: register → profile → categories → services → schedule → submit → approve → visible in search
- Client booking: register → search → availability → book → accept → start → complete → review → reply
- Cancellation: each of the four cancellation paths, asserting the history trail and notifications
- Session: login → refresh → refresh → **reuse an old token** → family revoked → re-login required

---

## 7. Requirement Traceability Matrix

Every `SRS-*` requirement maps to at least one test. Maintained here and checked at phase exit.

| Requirement | Test |
| --- | --- |
| SRS-AUTH-2 (no admin registration) | `auth.e2e-spec.ts › rejects a role field in the registration body`, plus an OpenAPI assertion that no admin registration route exists |
| SRS-AUTH-5 (rotation + reuse detection) | `auth.service.spec.ts › revokes the family on reuse`, `auth.e2e-spec.ts › session journey` |
| SRS-AUTH-9 (no user enumeration) | `auth.e2e-spec.ts › identical response for unknown email and wrong password` |
| SRS-MOD-3 (unapproved masters invisible) | `search.e2e-spec.ts › excludes pending masters` |
| SRS-MOD-4 (readiness before approval) | `moderation.e2e-spec.ts › 409 when the master has no service` |
| SRS-BOOK-2 (state machine) | `booking-state-machine.spec.ts` (exhaustive) |
| SRS-BOOK-3 (no overlaps) | `booking-transition.integration-spec.ts › concurrent acceptance` |
| SRS-BOOK-4 (history) | `bookings.e2e-spec.ts › appends history on every transition` |
| SRS-REV-1 (booking-gated) | `reviews.e2e-spec.ts › 409 for a non-completed booking` |
| SRS-REV-3 (transactional aggregates) | `reviews.integration-spec.ts › rating recomputed in the same transaction` |
| SRS-USER-5 (contact disclosure) | `bookings.e2e-spec.ts › hides the client phone until acceptance` |
| SRS-X-1 (validation) | `validation.e2e-spec.ts › 422 with a details array` |
| SRS-X-2 (error envelope) | Shared assertion helper applied to every error test |

The full matrix lives in this section and grows with each feature. A phase does not exit with an unmapped requirement.

---

## 8. Test Data

```ts
// test/fixtures/master.fixture.ts
export const createApprovedMaster = async (
  prisma: PrismaService,
  overrides: Partial<MasterFixture> = {},
): Promise<MasterFixture> => { … };
```

Rules
- Fixtures build **valid** entities by default; a test overrides only the field it is about, so the intent of the test is visible in the diff.
- Every test creates its own data. No shared mutable state, no ordering dependency.
- Isolation by transaction rollback per test, or by truncation between tests — never by hoping tests do not collide.
- No production data, ever, including anonymised extracts.

---

## 9. What Is Not Tested

Deliberate exclusions, so nobody wastes effort chasing them:

- Framework behaviour (that Nest routes correctly, that Prisma generates valid SQL)
- Third-party libraries
- Generated code
- Trivial getters and DTO classes with no logic
- Configuration files

Testing these produces coverage percentage and no confidence.

---

## 10. CI Pipeline

```
lint → typecheck → unit → integration → e2e → coverage gate → npm audit → gitleaks
```

- All stages must pass to merge.
- Unit tests run on every push; integration and e2e on every pull request.
- Total pull-request pipeline target: under 10 minutes.
- **A flaky test is a failing test.** It is quarantined and fixed within one working day, never retried into green. Retrying flaky tests trains the team to ignore red, which is how a real failure ships.

---

## 11. Commands

```bash
npm test                  # unit
npm run test:watch
npm run test:integration  # requires Docker
npm run test:e2e
npm run test:cov
npm run test:all          # everything, as CI runs it
```
