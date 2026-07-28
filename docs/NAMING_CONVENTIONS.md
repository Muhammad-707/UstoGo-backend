# Naming Conventions — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

Naming is the cheapest documentation there is. These conventions are enforced in review and, where possible, by ESLint.

---

## 1. Files and Directories

- Directories: `kebab-case`, plural for collections of like things (`controllers/`, `dto/`, `exceptions/`)
- Files: `kebab-case` with a type suffix — `booking-transition.service.ts`
- One exported class per file, named after the file: `booking-transition.service.ts` → `BookingTransitionService`

| Type | Suffix | Example |
| --- | --- | --- |
| Module | `.module.ts` | `bookings.module.ts` |
| Controller | `.controller.ts` | `admin-masters.controller.ts` |
| Service | `.service.ts` | `availability.service.ts` |
| Repository | `.repository.ts` | `bookings.prisma.repository.ts` |
| Guard | `.guard.ts` | `master-approved.guard.ts` |
| Interceptor | `.interceptor.ts` | `audit.interceptor.ts` |
| Filter | `.filter.ts` | `global-exception.filter.ts` |
| Pipe | `.pipe.ts` | `parse-uuid.pipe.ts` |
| Decorator | `.decorator.ts` | `current-user.decorator.ts` |
| DTO | `.dto.ts` | `create-booking.dto.ts` |
| Entity/type | `.type.ts` / `.interface.ts` | `authenticated-user.type.ts` |
| Event | `.event.ts` | `booking-accepted.event.ts` |
| Exception | `.exception.ts` | `slot-not-available.exception.ts` |
| Job | `.job.ts` | `expire-pending-bookings.job.ts` |
| Constant | `.constants.ts` | `booking.constants.ts` |
| Unit test | `.spec.ts` | `booking-state-machine.spec.ts` |
| E2E test | `.e2e-spec.ts` | `bookings.e2e-spec.ts` |

---

## 2. TypeScript Identifiers

| Kind | Case | Example |
| --- | --- | --- |
| Class | `PascalCase` | `BookingTransitionService` |
| Interface | `PascalCase`, **no `I` prefix** | `BookingsRepository` |
| Type alias | `PascalCase` | `AuthenticatedUser` |
| Enum | `PascalCase` | `BookingStatus` |
| Enum member | `SCREAMING_SNAKE_CASE` | `CANCELLED_BY_CLIENT` |
| Function / method | `camelCase`, verb-first | `computeAvailableSlots()` |
| Variable | `camelCase` | `pendingBookings` |
| Module constant | `SCREAMING_SNAKE_CASE` | `MAX_PENDING_BOOKINGS` |
| Private field | `camelCase` with `private readonly` | `private readonly repo: …` |
| Generic parameter | Single uppercase or descriptive | `T`, `TEntity` |
| Boolean | `is` / `has` / `can` / `should` prefix | `isLateCancellation`, `hasCertificates` |

**No `I` prefix on interfaces.** `IBookingsRepository` encodes an implementation detail into the name of an abstraction. The interface is the concept (`BookingsRepository`); the class is the detail (`BookingsPrismaRepository`).

---

## 3. Methods

Verb-first, and the verb tells you the contract:

| Prefix | Contract |
| --- | --- |
| `find…` | Returns the entity or `null` |
| `get…` | Returns the entity or **throws** |
| `list…` | Returns a paginated collection |
| `create…` | Inserts and returns the new entity |
| `update…` | Mutates and returns the updated entity |
| `delete…` / `remove…` | Soft-deletes |
| `assert…` | Returns `void` or throws — a guard clause |
| `compute…` / `calculate…` | Pure, no side effects |
| `handle…` | Event listener |
| `is…` / `has…` / `can…` | Returns `boolean` |

```ts
findById(id: string): Promise<Booking | null>
getById(id: string): Promise<Booking>            // throws BookingNotFoundException
listForClient(clientId: string, q: QueryDto): Promise<Paginated<Booking>>
assertCanTransition(b: Booking, to: BookingStatus, actor: ActorType): void
computeAvailableSlots(input: SlotInput): Date[]
```

The `find`/`get` distinction removes an entire class of null-handling bugs: the caller can see from the name whether it must check.

---

## 4. DTOs

| Direction | Pattern | Example |
| --- | --- | --- |
| Request — create | `Create<Entity>Dto` | `CreateBookingDto` |
| Request — update | `Update<Entity>Dto` | `UpdateServiceDto` |
| Request — action | `<Action><Entity>Dto` | `CancelBookingDto`, `RejectMasterDto` |
| Request — query | `Query<Entities>Dto` | `QueryMastersDto` |
| Response — single | `<Entity>ResponseDto` | `BookingResponseDto` |
| Response — list item | `<Entity>ListItemDto` | `MasterListItemDto` |
| Response — nested | `<Concept>Dto` | `AddressDto`, `RatingDistributionDto` |

List items are deliberately a different class from the single-resource response: a search result and a profile page expose different fields, and conflating them is how private data leaks into list endpoints.

---

## 5. Database

| Element | Convention | Example |
| --- | --- | --- |
| Prisma model | `PascalCase` singular | `MasterProfile` |
| Table | `snake_case` plural via `@@map` | `master_profiles` |
| Prisma field | `camelCase` | `approvalStatus` |
| Column | `snake_case` via `@map` | `approval_status` |
| FK field | `<entity>Id` | `masterProfileId` |
| Boolean column | `is_` / `has_` prefix | `is_active`, `is_late_cancellation` |
| Timestamp | `<verb>edAt` | `createdAt`, `approvedAt`, `cancelledAt` |
| Join model | Both names, PascalCase | `MasterCategory` |
| Index | `idx_<table>_<cols>` | `idx_bookings_master_status_scheduled` |
| Unique index | `uq_<table>_<cols>` | `uq_reviews_booking_id` |
| Check constraint | `ck_<table>_<rule>` | `ck_services_price_positive` |
| Exclusion constraint | `<table>_no_<rule>` | `bookings_no_overlap` |
| Enum type | `PascalCase` in Prisma | `BookingStatus` |
| Enum value | `SCREAMING_SNAKE_CASE` | `IN_PROGRESS` |
| Migration | `<timestamp>_<verb>_<subject>` | `20260729_add_booking_overlap_exclusion` |

---

## 6. API

| Element | Convention | Example |
| --- | --- | --- |
| Path segment | `kebab-case`, plural nouns | `/api/v1/master-profiles` → in practice `/masters` |
| Sub-resource | Nested under its parent | `/masters/:id/reviews` |
| Action on a resource | Verb as a trailing segment | `POST /bookings/:id/accept` |
| Own-resource shorthand | `/me` | `GET /users/me`, `GET /masters/me/services` |
| Query parameter | `camelCase` | `?categoryId=&minRating=` |
| JSON field | `camelCase` | `ratingAverage` |
| Header | `Kebab-Case` | `X-Request-Id` |
| Error code | `SCREAMING_SNAKE_CASE` | `SLOT_NOT_AVAILABLE` |
| Sort value | `field:direction` | `?sort=rating:desc` |

Actions like `accept`, `reject`, `complete` are verbs because they are state transitions, not resources. Modelling them as `PATCH /bookings/:id { status: … }` would place the transition table in the client's hands; a named action keeps it on the server.

---

## 7. Events

`<entity>.<past-tense-verb>` for the name, `<Entity><PastTense>Event` for the class.

```ts
export const BOOKING_ACCEPTED = 'booking.accepted';
export class BookingAcceptedEvent { … }
```

Past tense matters: an event is a fact that has already happened. `booking.accept` would read as a command, and a listener might reasonably think it could veto it.

---

## 8. Constants

Grouped, frozen, and named for the rule they encode:

```ts
export const BOOKING = Object.freeze({
  MIN_LEAD_MINUTES: 120,
  START_WINDOW_MINUTES: 30,
  LATE_CANCELLATION_HOURS: 3,
  MAX_PENDING_PER_CLIENT: 5,
  EXPIRY_JOB_BATCH_SIZE: 100,
} as const);
```

No magic numbers or strings in business code. `if (diffHours < 3)` tells a reader nothing; `if (diffHours < BOOKING.LATE_CANCELLATION_HOURS)` tells them the rule.

---

## 9. Tests

```ts
describe('BookingStateMachine', () => {
  describe('assertCanTransition', () => {
    it('allows PENDING → ACCEPTED for the master', () => { … });
    it('throws IllegalBookingTransitionException for COMPLETED → ACCEPTED', () => { … });
    it('requires a reason when the master rejects', () => { … });
  });
});
```

- `describe` names the unit, then the method
- `it` reads as a sentence: "it allows PENDING → ACCEPTED for the master"
- No `should` prefix — it adds a word to every line and information to none

---

## 10. Git

**Branches:** `<type>/<short-description>` — `feat/booking-state-machine`, `fix/refresh-token-reuse`

**Commits:** Conventional Commits.

```
<type>(<scope>): <subject in the imperative mood>

<body: why, not what>

<footer: BREAKING CHANGE / refs>
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`
Scopes: the module name — `auth`, `bookings`, `masters`, `reviews`, `db`, `docs`

```
feat(auth): implement refresh token rotation with reuse detection
fix(bookings): prevent overlapping accepted bookings under concurrency
docs(database): document the booking overlap exclusion constraint
```

Subject: imperative, lowercase, no trailing period, ≤ 72 characters. Enforced by commitlint.
