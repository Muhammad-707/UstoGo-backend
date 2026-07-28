# Authorization — UstoGo

**Version:** 1.0.0 · **Last updated:** 2026-07-29
**Normative permission source:** `USER_ROLES.md`

---

## 1. The Four Questions

Every protected request answers four questions, in this order. Each is answered in a specific place, and mixing them up is the most common source of authorization bugs.

| # | Question | Answered by | Failure |
| --- | --- | --- | --- |
| 1 | Is the caller authenticated? | `JwtAuthGuard` (global) | `401` |
| 2 | Does the caller's **role** permit this operation? | `RolesGuard` + `@Roles()` | `403` |
| 3 | Is the caller's **account state** eligible? | `MasterApprovedGuard` and similar | `403` |
| 4 | Does the caller **own** or participate in this resource? | Service layer | `404` (not `403`) |

**Why ownership returns 404.** Returning `403` for a resource you do not own confirms that the resource exists. `GET /bookings/<uuid>` returning `403` tells an attacker that this UUID is a real booking. Returning `404` for both "does not exist" and "not yours" leaks nothing. This is a deliberate, documented deviation from the naive reading of HTTP semantics.

---

## 2. Guard Stack

```
Request
  → RequestIdMiddleware
  → ThrottlerGuard          (rate limits)
  → JwtAuthGuard            (global; bypassed by @Public())
  → RolesGuard              (reads @Roles metadata)
  → Feature guards          (e.g. MasterApprovedGuard)
  → ValidationPipe          (DTO whitelist)
  → Controller
  → Service                 ← ownership and business-rule checks live HERE
```

### 2.1 `JwtAuthGuard` — global with explicit opt-out

```ts
// app.module.ts
{ provide: APP_GUARD, useClass: JwtAuthGuard }
```

Public routes opt out with `@Public()`. The default is *protected*: forgetting a decorator produces a locked endpoint, not an open one. Fail-closed is the only acceptable default.

### 2.2 `RolesGuard`

```ts
@Roles(UserRole.MASTER)
@Post('me/services')
createService(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateServiceDto) { … }
```

The guard reads metadata from the handler and then the class, and denies when the user's role is absent from the list. No `@Roles()` on a protected route means "any authenticated role".

### 2.3 `MasterApprovedGuard`

Blocks routes that require an approved master (accepting bookings, appearing in search-adjacent operations). Reads `approvalStatus` and `isActive` **from the database**, not from the JWT, because both are mutable during a token's lifetime.

### 2.4 `@CurrentUser()` decorator

The only sanctioned way to read the caller. Services never receive raw request objects, and controllers never read `request.user` directly.

---

## 3. Ownership Rules

Ownership is a **business rule**, so it lives in services, not guards. A guard would need to load the resource to decide, the service then loads it again, and the two can drift. One load, one decision.

Canonical pattern:

```ts
async findOne(bookingId: string, user: AuthenticatedUser): Promise<Booking> {
  const booking = await this.repo.findById(bookingId);
  if (!booking) throw new BookingNotFoundException();

  const isParticipant =
    booking.clientProfile?.userId === user.id ||
    booking.masterProfile?.userId === user.id;

  if (!isParticipant && user.role !== UserRole.ADMIN) {
    throw new BookingNotFoundException(); // 404, never 403
  }
  return booking;
}
```

| Resource | Owner | Admin override |
| --- | --- | --- |
| `ClientProfile` / `MasterProfile` | the linked `User` | read + moderate |
| `Service`, `WorkingDay`, `ScheduleException`, `Certificate` | the owning master | read + deactivate |
| `Booking` | client **and** master participant | read + force-cancel |
| `Review` | author (write), reviewed master (reply) | read + hide |
| `Conversation` / `Message` | the two participants | audited dispute access only |
| `Notification` | recipient | ❌ no override |
| `File` | uploader | read for moderation |

---

## 4. Field-Level Authorization

Role decides *which fields* a caller sees, not only which endpoints they may call.

| Field | Visible to |
| --- | --- |
| `passwordHash`, `tokenHash` | nobody, ever — excluded at the repository `select` |
| `user.email` | self, admin |
| `client.phone` | self, admin, and the master **only when the booking is `ACCEPTED`/`IN_PROGRESS`/`COMPLETED`** |
| `booking.address.line` | client, admin, and the master after acceptance |
| `booking.address.district` | client, admin, master at any status |
| `master.rejectionReason` | the master themselves, admin |
| `review.hiddenReason` | admin only |
| `auditLog.*` | admin only |

Enforced by a `ClassSerializerInterceptor` with `@Exclude()`/`@Expose({ groups })` on response DTOs, plus explicit projection functions for the conditional cases. Entities are never returned directly from a controller — the mapping step is where field policy is applied, and skipping it is a review-blocking defect.

---

## 5. State-Based Authorization

Some permissions depend on resource state rather than caller identity.

| Operation | State precondition |
| --- | --- |
| Accept / reject booking | status is `PENDING` |
| Start booking | status is `ACCEPTED` and now ≥ `scheduledAt − 30 min` |
| Complete booking | status is `IN_PROGRESS` |
| Client cancel | status is `PENDING` or `ACCEPTED` |
| Write review | booking is `COMPLETED` and within 30 days |
| Edit review | within 24 hours of creation |
| Reply to review | no reply exists |
| Publish a service | master `approvalStatus ∈ {PENDING, APPROVED}` |
| Receive a booking | master `APPROVED` and `isActive` |

All booking transitions are checked by one component:

```ts
@Injectable()
export class BookingStateMachine {
  private static readonly TRANSITIONS: ReadonlyMap<BookingStatus, ReadonlyArray<Transition>> = /* … */;

  assertCanTransition(booking: Booking, to: BookingStatus, actor: ActorType): void {
    const allowed = BookingStateMachine.TRANSITIONS.get(booking.status) ?? [];
    const rule = allowed.find(t => t.to === to && t.actors.includes(actor));
    if (!rule) throw new IllegalBookingTransitionException(booking.status, to, actor);
    if (rule.requiresReason && !reasonProvided) throw new ReasonRequiredException();
  }
}
```

There is exactly one transition table in the codebase (`FUNCTIONAL_REQUIREMENTS.md` §7.1). Any `if (booking.status === …)` scattered in a service is a defect.

---

## 6. Admin Boundaries

Admins are moderators, not superusers.

| Admin **can** | Admin **cannot** |
| --- | --- |
| Read all business data | Read password hashes or tokens |
| Approve, reject, activate, deactivate masters | Impersonate a user or mint tokens |
| Force-cancel a booking with a reason | Create a booking or a review |
| Hide or unhide a review | Edit a review's text |
| Manage categories and banners | Read another user's notifications |
| Read audit logs | Modify or delete audit logs |
| Access chat in a flagged dispute (audited) | Browse chat freely |

`AuditAction.CONVERSATION_ACCESSED` exists precisely so that the one sensitive read admins are permitted leaves a trail.

---

## 7. Anti-Patterns (rejected in review)

```ts
// ❌ role check in the controller body
if (req.user.role !== 'ADMIN') throw new ForbiddenException();

// ❌ ownership decided from a client-supplied id
@Get('bookings') list(@Query('userId') userId: string) { … }

// ❌ 403 for a resource the caller doesn't own (leaks existence)
if (booking.clientId !== user.id) throw new ForbiddenException();

// ❌ trusting a mutable attribute from the JWT
if (jwt.approvalStatus === 'APPROVED') { … }

// ❌ returning the entity directly, bypassing field policy
return this.prisma.user.findUnique({ where: { id } });
```

Correct forms:

```ts
// ✅ declarative role
@Roles(UserRole.ADMIN)

// ✅ identity from the token, never from the query string
@Get('bookings') list(@CurrentUser() user: AuthenticatedUser) { … }

// ✅ 404 for both "absent" and "not yours"
if (!isParticipant) throw new BookingNotFoundException();

// ✅ mutable state re-read from the database
const master = await this.masters.findByUserId(user.id);
if (master.approvalStatus !== ApprovalStatus.APPROVED) throw new MasterNotApprovedException();

// ✅ explicit response mapping
return BookingResponseDto.fromEntity(booking, viewerRole);
```

---

## 8. Test Requirements

For **every** protected endpoint the e2e suite asserts:

1. `401` without a token
2. `401` with a malformed or expired token
3. `403` for each role that must not reach it
4. `404` when the resource belongs to another user
5. `200`/`201` for the legitimate owner
6. Response contains no field the caller is not entitled to see

These six are generated from a shared test helper so the matrix cannot be forgotten when a new endpoint is added. Guard coverage target is 90%; the booking state machine is 100% of branches.
