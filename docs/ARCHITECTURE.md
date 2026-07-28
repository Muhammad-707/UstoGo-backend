# Architecture — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

---

## 1. Style

**Feature-based modular monolith** with clean-architecture layering inside each feature.

Why a monolith: the domain is small, the team is small, and the transactional boundaries (booking acceptance touching availability, bookings and notifications) sit naturally inside one database. Distributed transactions to solve a problem we do not have would be a self-inflicted wound. The module boundaries are drawn so that extraction into services is mechanical if scale ever demands it.

---

## 2. Layers

```
┌─────────────────────────────────────────────────────────┐
│ TRANSPORT      controllers · gateways · DTOs · guards    │
│                HTTP concerns only. No business rules.    │
├─────────────────────────────────────────────────────────┤
│ APPLICATION    services · use cases · orchestration      │
│                Business rules, transactions, events.     │
├─────────────────────────────────────────────────────────┤
│ DOMAIN         entities · value objects · state machines │
│                Pure logic. No framework, no I/O.         │
├─────────────────────────────────────────────────────────┤
│ INFRASTRUCTURE repositories · Prisma · storage · mail    │
│                The only layer that talks to the outside. │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** dependencies point downward only. Domain knows nothing about application; application knows nothing about transport. Infrastructure implements interfaces _declared_ by the application layer, so the arrow points inward there too.

| Layer          | May import                        | May never import                                          |
| -------------- | --------------------------------- | --------------------------------------------------------- |
| Transport      | Application, DTOs                 | Prisma client, repositories                               |
| Application    | Domain, repository **interfaces** | `@nestjs/common` HTTP decorators, `PrismaClient` directly |
| Domain         | nothing                           | everything                                                |
| Infrastructure | Domain, repository interfaces     | Transport                                                 |

The rule that hurts most and pays most: **controllers never touch Prisma**. A controller that queries the database has no seam for testing, no place for a transaction and no reuse from a job or a gateway.

---

## 3. Module Anatomy

```
src/modules/bookings/
├── bookings.module.ts
├── controllers/
│   ├── bookings.controller.ts
│   └── admin-bookings.controller.ts
├── services/
│   ├── bookings.service.ts            # orchestration
│   ├── booking-creation.service.ts    # creation pre-conditions
│   └── booking-transition.service.ts  # lifecycle transitions
├── domain/
│   ├── booking-state-machine.ts       # pure, exhaustively tested
│   └── booking-policies.ts            # lead time, late cancellation
├── repositories/
│   ├── bookings.repository.interface.ts
│   └── bookings.prisma.repository.ts
├── dto/
│   ├── requests/
│   └── responses/
├── exceptions/
├── events/
├── constants/
├── enums/
├── types/
└── README.md
```

Two services rather than one 600-line `BookingsService`: creation and transition have different pre-conditions, different collaborators and different tests. Splitting by _reason to change_ is the practical reading of the single-responsibility principle.

---

## 4. Module Graph

```
                        ┌──────────────┐
                        │ CommonModule │  pipes · filters · interceptors · decorators
                        └──────┬───────┘
   ┌───────────────┬───────────┼─────────────┬────────────────┐
┌──▼───────┐ ┌─────▼──────┐ ┌──▼─────────┐ ┌─▼──────────┐ ┌───▼──────┐
│ConfigMod │ │PrismaModule│ │LoggerModule│ │HealthModule│ │MailModule│
└──┬───────┘ └─────┬──────┘ └────────────┘ └────────────┘ └───┬──────┘
   └───────────────┼──────────────────────────────────────────┘
             ┌─────▼─────┐   ┌────────────┐   ┌───────────┐
             │UsersModule│◄──│ AuthModule │   │FilesModule│
             └─────┬─────┘   └────────────┘   └─────┬─────┘
                   │                                │
      ┌────────────┼────────────────────────────────┘
┌─────▼───────┐ ┌──▼────────────┐ ┌──────────────┐
│MastersModule│ │CategoriesMod  │ │ AuditModule  │
└─────┬───────┘ └──┬────────────┘ └──────────────┘
      │            │
┌─────▼───────┐ ┌──▼───────────┐
│ServicesMod  │ │ScheduleModule│
└─────┬───────┘ └──┬───────────┘
      └─────┬──────┘
      ┌─────▼──────┐   ┌──────────────┐
      │SearchModule│   │BookingsModule│
      └────────────┘   └──┬───────────┘
                ┌─────────┼──────────┬─────────────┐
        ┌───────▼──┐ ┌────▼────────┐ ┌▼─────────┐ ┌▼────────────┐
        │ReviewsMod│ │Notifications│ │ChatModule│ │BannersModule│
        └──────────┘ └─────────────┘ └──────────┘ └─────────────┘
                                                   ┌─────────────┐
                                                   │ AdminModule │
                                                   └─────────────┘
```

Cycles are impossible by construction and enforced by `eslint-plugin-import/no-cycle` at error level.

---

## 5. Cross-Module Communication

Three sanctioned mechanisms, in order of preference:

**1. Domain events (default for side effects).** Bookings does not know that notifications exist.

```ts
// bookings/services/booking-transition.service.ts
await this.tx.run(async (tx) => {
  await this.repo.updateStatus(bookingId, BookingStatus.ACCEPTED, tx);
  await this.history.append(bookingId, from, to, actor, tx);
});
this.events.emit(
  new BookingAcceptedEvent(booking.id, booking.clientProfileId, booking.scheduledAt),
);
```

```ts
// notifications/listeners/booking.listener.ts
@OnEvent('booking.accepted')
async handle(event: BookingAcceptedEvent): Promise<void> { … }
```

Events are emitted **after** the transaction commits, never inside it — a notification for a rolled-back booking is worse than a missing one.

**2. Direct service injection (for synchronous reads within a request).** `BookingsService` injects `ScheduleService` to compute availability. Permitted only downward along the module graph.

**3. Shared read models (for cross-cutting queries).** The search module reads a projection rather than reaching into six repositories.

Explicitly forbidden: a module importing another module's Prisma repository, or two modules importing each other.

---

## 6. Transaction Strategy

A `TransactionManager` wraps Prisma's interactive transactions and exposes a request-scoped client, so repositories accept an optional transaction handle without every service knowing about Prisma.

```ts
await this.tx.run(async (tx) => {
  const review = await this.reviews.create(dto, tx);
  await this.masters.recalculateRating(dto.masterProfileId, tx);
  return review;
});
```

Rules

- Any operation writing more than one table runs in a transaction (NFR-D-1)
- Transactions are short: no HTTP calls, no email, no file I/O inside
- Booking acceptance uses `SERIALIZABLE` plus the GiST exclusion constraint (`DATABASE.md` §7.1)
- Write conflicts (`P2034`) are retried up to 3 times with jittered backoff
- Denormalised aggregates are updated inside the same transaction as their source of truth

---

## 7. Repository Pattern — Applied Selectively

Repositories are introduced where they earn their cost:

| Use a repository when                                                    | Use Prisma directly in the service when               |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| The entity has non-trivial query composition (bookings, masters, search) | The operation is a simple by-id read on a leaf entity |
| Soft-delete or visibility filtering must be centralised                  | The module is small and has one consumer              |
| The query is reused by several services or jobs                          |                                                       |
| Tests need an in-memory substitute                                       |                                                       |

A repository per table with a one-line pass-through method per Prisma call is ceremony, not architecture. The interface exists so the _service_ can be tested and so query logic has one home — not to abstract away a database we will never change.

Bookings, masters, services and search have repositories. Cities, banners and notifications use Prisma directly through the module's service.

---

## 8. Configuration

`ConfigModule` is global. The environment is parsed once at boot into a typed, frozen object:

```ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: connectionUrl(
    ['postgresql:', 'postgres:'],
    'must be a postgresql:// connection URL',
  ),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_TTL: duration('30d'),
  S3_BUCKET: z.string().min(1),
  // …
});
```

Connection URLs are validated by parsing with the `URL` constructor and checking the scheme, rather than by chaining `.refine()` onto `z.url()`: a chained refinement still runs after the URL check fails, so one bad value reports two contradictory issues.

Cross-field rules live in a `superRefine`: the access and refresh secrets must differ, and `CORS_ORIGINS=*` is rejected when `NODE_ENV=production`.

Validation runs in `main.ts` **before** `NestFactory.create`. Left to the provider factory, a failure surfaces inside dependency injection, and Nest's own `ExceptionHandler` logs it with a DI stack trace before the application can format it — an operator reading `Injector.instantiateClass` learns nothing about which variable is wrong. The parse is memoised, so `ConfigModule` reuses it rather than reading the environment twice.

A parse failure exits the process with a report naming every bad variable, before the HTTP listener binds. Variable _values_ are never included — the shortest secrets are exactly the ones that fail validation. `process.env` is never read outside this module.

---

## 9. Scheduled Jobs

| Job                          | Cadence      | Purpose                                                  |
| ---------------------------- | ------------ | -------------------------------------------------------- |
| `ExpirePendingBookingsJob`   | every 10 min | `PENDING` past its start → `EXPIRED`                     |
| `CleanupRefreshTokensJob`    | daily 03:00  | Hard-delete tokens expired > 30 days                     |
| `CleanupUnconfirmedFilesJob` | hourly       | Delete unconfirmed uploads > 24 h old                    |
| `RecalculateRatingsJob`      | daily 04:00  | Reconcile denormalised aggregates; log drift as an error |
| `PruneNotificationsJob`      | weekly       | Delete notifications > 180 days                          |
| `BookingReminderJob`         | every 15 min | Notify both parties 24 h and 2 h before a booking        |

All jobs are idempotent and multi-instance safe (PostgreSQL advisory locks or `FOR UPDATE SKIP LOCKED`). Jobs call the same services as HTTP handlers — no business logic lives in a job class.

---

## 10. Realtime (Phase 5)

Socket.io gateway on the `/chat` namespace, JWT verified in the handshake, rooms keyed by conversation id. The REST API remains functionally complete without it: the gateway pushes events that REST already exposes. When the WebSocket layer is down, clients degrade to polling and lose latency, not capability.

Multi-instance fan-out uses the Redis adapter.

---

## 11. Architecture Decision Records

| #      | Decision                                                                   | Rationale                                               | Rejected alternative                                                                     |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ADR-1  | Modular monolith                                                           | One transactional boundary, small team, simple ops      | Microservices — distributed transactions for a domain that fits in one database          |
| ADR-2  | Prisma                                                                     | Type safety, migration tooling, good DX                 | TypeORM — weaker types; raw SQL — no migration story                                     |
| ADR-3  | Opaque rotating refresh tokens                                             | Revocable, forensically traceable, reuse-detectable     | JWT refresh tokens — unrevocable without a DB lookup, which removes their only advantage |
| ADR-4  | Selective repositories                                                     | Abstraction where it pays, none where it doesn't        | Repository-for-everything — ceremony; no repositories — untestable services              |
| ADR-5  | Domain events for side effects                                             | Keeps bookings ignorant of notifications and chat       | Direct calls — a dependency cycle within two features                                    |
| ADR-6  | GiST exclusion constraint for booking overlap                              | Storage-level guarantee independent of application bugs | Application-only checks — a race window will eventually be hit                           |
| ADR-7  | 404 instead of 403 for foreign resources                                   | Prevents existence enumeration                          | Literal HTTP semantics — leaks the existence of every UUID probed                        |
| ADR-8  | Payments deferred                                                          | Removes PCI, licensing and payout complexity from v1    | In-platform payments — months of work before the core loop is proven                     |
| ADR-9  | Denormalised rating with transactional updates plus nightly reconciliation | O(1) sorting on rating; drift is detectable             | Computed on read — a join and aggregate on every search query                            |
| ADR-10 | S3-compatible storage with presigned URLs                                  | Binaries never touch the API; scales horizontally       | Local disk — breaks the moment there are two instances                                   |

Amending an ADR requires a new row, not an edit — the record of why is as valuable as the decision.

---

## 12. Quality Gates

| Gate                  | Threshold                                                                 |
| --------------------- | ------------------------------------------------------------------------- |
| File length           | ≤ 300 lines                                                               |
| Function length       | ≤ 50 lines                                                                |
| Cyclomatic complexity | ≤ 10                                                                      |
| Module cycles         | 0                                                                         |
| Coverage              | ≥ 80% global, ≥ 90% services/guards, 100% state machine and auth branches |
| Queries per request   | ≤ 10                                                                      |
| `any`                 | 0                                                                         |

Every gate is enforced in CI. A gate that is only aspirational is not a gate.
