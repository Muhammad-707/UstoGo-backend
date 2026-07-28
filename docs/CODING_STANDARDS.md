# Coding Standards — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

Every rule here exists because its absence caused a real class of bug. Where a rule can be automated it is automated; the rest are review gates.

---

## 1. TypeScript

```jsonc
// tsconfig.json (essentials)
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "exactOptionalPropertyTypes": true,
  "forceConsistentCasingInFileNames": true
}
```

Rules
- `any` is banned. Use `unknown` and narrow. The only exception is third-party declaration merging, and it requires an inline justification comment.
- Every exported function has an explicit return type. Inference inside a function body is fine; inference across a module boundary is a silent API change waiting to happen.
- Prefer `type` for unions and object shapes, `interface` for contracts that classes implement.
- No non-null assertion (`!`) except on class fields initialised by the framework (`@Inject`, DTO properties), where it is the idiomatic signal.
- `as` casts require a comment explaining why the compiler is wrong.
- `readonly` on every field that is not reassigned; `Object.freeze` on exported constant objects.

```ts
// ❌
function parse(input: any) { return input.value; }

// ✅
function parse(input: unknown): string {
  if (typeof input === 'object' && input !== null && 'value' in input) {
    return String((input as { value: unknown }).value);
  }
  throw new BadRequestException();
}
```

---

## 2. Functions

- ≤ 50 lines. Beyond that, extract.
- ≤ 4 parameters; past that, take an options object.
- One level of abstraction per function: do not mix "orchestrate the booking flow" with "format a date string".
- Guard clauses over nested conditionals.
- No boolean parameters that switch behaviour — split the function.

```ts
// ❌ arrow-shaped
async function accept(id: string) {
  const b = await this.repo.findById(id);
  if (b) {
    if (b.status === 'PENDING') {
      if (await this.isAvailable(b)) {
        return this.repo.update(…);
      } else { throw new SlotNotAvailableException(); }
    } else { throw new IllegalTransitionException(); }
  } else { throw new BookingNotFoundException(); }
}

// ✅ flat, with guard clauses
async function accept(id: string, actor: AuthenticatedUser): Promise<Booking> {
  const booking = await this.repo.getById(id);
  this.stateMachine.assertCanTransition(booking, BookingStatus.ACCEPTED, ActorType.MASTER);
  await this.assertSlotStillFree(booking);
  return this.transition(booking, BookingStatus.ACCEPTED, actor);
}
```

---

## 3. Classes

- One responsibility per class; if the class name needs "and", split it.
- Constructor injection only. No property injection, no service locator.
- Dependencies typed by interface where an interface exists.
- Public methods first, private helpers after, ordered by call sequence so the file reads top-down.
- No static mutable state.

```ts
@Injectable()
export class BookingTransitionService {
  constructor(
    private readonly bookings: BookingsRepository,
    private readonly history: BookingHistoryService,
    private readonly stateMachine: BookingStateMachine,
    private readonly tx: TransactionManager,
    private readonly events: EventEmitter2,
  ) {}
}
```

---

## 4. Controllers

Thin. A controller receives, delegates and returns. Anything else belongs elsewhere.

```ts
@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @Roles(UserRole.CLIENT)
  @ApiOperation({ summary: 'Create a booking' })
  @ApiCreatedResponse({ type: BookingResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookings.create(user, dto);
    return BookingResponseDto.fromEntity(booking, user.role);
  }
}
```

Forbidden in a controller: Prisma, `if (user.role === …)`, try/catch around business calls, computed business values, more than ~10 lines per handler.

---

## 5. Services

- Own the business rules and the transaction boundaries.
- Throw named domain exceptions, never generic `Error`.
- Return domain entities; mapping to response DTOs happens at the transport edge.
- Never import `Request`, `Response` or any HTTP decorator.
- Emit events after commit, never inside a transaction.

```ts
async create(user: AuthenticatedUser, dto: CreateBookingDto): Promise<Booking> {
  const master  = await this.masters.getApprovedById(dto.masterId);
  const service = await this.services.getActiveForMaster(dto.serviceId, master.id);

  this.policies.assertLeadTime(dto.scheduledAt);
  await this.availability.assertSlotFree(master, dto.scheduledAt, service.durationMinutes);
  await this.assertClientHasCapacity(user.id, dto.scheduledAt, service.durationMinutes);

  const booking = await this.tx.run((tx) => this.persist(user, master, service, dto, tx));
  this.events.emit(BOOKING_CREATED, new BookingCreatedEvent(booking.id));
  return booking;
}
```

---

## 6. Repositories

- Query composition only. No business decisions.
- Every method accepts an optional transaction client so it can participate in a caller's transaction.
- Always `select` explicitly — never leak `passwordHash` by returning a whole row.
- No `findMany` without a `take`.

```ts
async findOverlapping(masterId: string, from: Date, to: Date, tx?: PrismaTx): Promise<Booking[]> {
  return (tx ?? this.prisma).booking.findMany({
    where: {
      masterProfileId: masterId,
      status: { in: [BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS] },
      scheduledAt: { lt: to },
      endsAt: { gt: from },
    },
    take: 100,
  });
}
```

---

## 7. Async

- `async/await` everywhere; no raw `.then()` chains.
- Every promise is awaited or explicitly returned. `no-floating-promises` is an error.
- Independent awaits run concurrently with `Promise.all`; dependent ones stay sequential.
- No `await` inside a loop over a collection — batch the query instead. This is the single most common source of N+1 latency.

```ts
// ❌ N+1
for (const id of masterIds) { results.push(await this.repo.findById(id)); }

// ✅ one query
const masters = await this.repo.findManyByIds(masterIds);
```

---

## 8. Error Handling

- Throw domain exceptions from services; the global filter maps them.
- Catch only when you can add value: enrich and rethrow, or handle and continue.
- Never swallow. `catch (e) {}` fails review unconditionally.
- Never expose an ORM or SQL message to a client.

```ts
// ✅ catch to translate, then rethrow
try {
  return await this.prisma.user.create({ data });
} catch (error) {
  if (isPrismaError(error, 'P2002')) throw new EmailAlreadyExistsException();
  throw error;
}
```

---

## 9. Comments

Comment **why**, never **what**. The code already says what.

```ts
// ❌
// increment the counter
count += 1;

// ✅
// Serializable isolation is required here: two masters accepting overlapping
// slots concurrently would both pass a READ COMMITTED availability check.
await this.tx.run(fn, { isolationLevel: 'Serializable' });
```

JSDoc on public service methods with non-obvious contracts — invariants, throwing behaviour, transaction expectations. No JSDoc that restates the signature.

`TODO` comments are banned in merged code (`PROJECT_RULES.md`). Unfinished work goes to `TODO.md` or `BACKLOG.md`, where it is visible and tracked, not buried in a file nobody opens.

---

## 10. Imports

Ordered, alias-based across module boundaries:

```ts
// 1. node builtins
import { randomBytes } from 'node:crypto';
// 2. external
import { Injectable } from '@nestjs/common';
// 3. internal aliases
import { TransactionManager } from '@prisma-lib/transaction.manager';
import { CurrentUser } from '@common/decorators';
// 4. relative (same module only)
import { BookingStateMachine } from '../domain/booking-state-machine';
```

Enforced by `eslint-plugin-import/order`. Cross-module relative imports are an error.

---

## 11. Prohibited

| Practice | Why |
| --- | --- |
| `any` | Erases the entire benefit of TypeScript |
| `console.log` | Bypasses structured logging and redaction |
| Magic numbers/strings in business code | Unreadable and un-greppable |
| Business logic in a controller | Untestable, unreusable |
| Prisma in a controller | No transaction seam, no test seam |
| Returning an entity from a controller | Bypasses field-level authorization |
| `catch {}` | Hides failures |
| Placeholder/stub implementations | Looks done, is not (`PROJECT_RULES.md`) |
| Commented-out code | That is what git is for |
| `process.env` outside `ConfigModule` | Untyped, unvalidated |
| `$queryRawUnsafe` | Injection surface |
| Cross-module circular imports | Build failure |
| Files > 300 lines | The abstraction is wrong |

---

## 12. Automated Enforcement

```jsonc
// .eslintrc.cjs — the rules that matter
{
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/explicit-module-boundary-types": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "import/no-cycle": ["error", { "maxDepth": Infinity }],
  "import/order": ["error", { "newlines-between": "always" }],
  "max-lines": ["error", { "max": 300, "skipBlankLines": true, "skipComments": true }],
  "max-lines-per-function": ["error", { "max": 50 }],
  "complexity": ["error", 10],
  "no-console": "error",
  "no-restricted-syntax": [
    "error",
    { "selector": "CallExpression[callee.property.name='$queryRawUnsafe']", "message": "Use Prisma.sql tagged templates." }
  ]
}
```

Pre-commit (Husky + lint-staged): ESLint `--fix`, Prettier, `tsc --noEmit`.
Pre-push: unit tests.
CI: lint, typecheck, unit, integration, e2e, coverage thresholds, `npm audit`, gitleaks.

A pull request that fails any gate is not reviewed until it is green. Review time is for design, not for catching what a machine catches.
