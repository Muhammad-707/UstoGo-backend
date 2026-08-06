# Error Handling — UstoGo

**Version:** 1.0.0 · **Last updated:** 2026-07-29

**Principles**

1. One error envelope for the entire API.
2. Machine-readable `code` first; human-readable `message` second. Clients branch on `code`, never on `message`.
3. Never leak internals: no stack traces, no SQL, no ORM error text, no file paths in a production response.
4. Every error is correlatable to a log line through `requestId`.
5. Errors are thrown by domain exceptions, never constructed ad hoc in controllers.

---

## 1. Envelope

```json
{
  "statusCode": 409,
  "code": "SLOT_NOT_AVAILABLE",
  "message": "The requested time slot is no longer available.",
  "details": [],
  "path": "/api/v1/bookings",
  "timestamp": "2026-07-29T10:15:00.000Z",
  "requestId": "01J9X4K7QW8ZP2"
}
```

| Field        | Type   | Notes                                                                                   |
| ------------ | ------ | --------------------------------------------------------------------------------------- |
| `statusCode` | int    | HTTP status, mirrors the response status                                                |
| `code`       | string | Stable SCREAMING_SNAKE identifier. Adding a code is additive; changing one is breaking. |
| `message`    | string | English, developer-facing. Clients localise from `code`.                                |
| `details`    | array  | Field-level violations for `422`; empty otherwise                                       |
| `path`       | string | Request path without the query string                                                   |
| `timestamp`  | string | ISO-8601 UTC                                                                            |
| `requestId`  | string | Correlates to logs and to the `X-Request-Id` header                                     |

---

## 2. Exception Hierarchy

```
HttpException (Nest)
└── AppException              ← base for every domain error, carries `code`
    ├── ValidationFailedException      422
    ├── ResourceNotFoundException      404
    ├── ConflictException              409
    ├── UnauthorizedException          401
    ├── ForbiddenException             403
    └── BusinessRuleViolationException 422 | 409
```

```ts
export abstract class AppException extends HttpException {
  protected constructor(
    readonly code: string,
    message: string,
    status: HttpStatus,
    readonly details: ErrorDetail[] = [],
  ) {
    super({ code, message, details }, status);
  }
}

export class SlotNotAvailableException extends AppException {
  constructor() {
    super(
      'SLOT_NOT_AVAILABLE',
      'The requested time slot is no longer available.',
      HttpStatus.CONFLICT,
    );
  }
}
```

Each feature module owns its exceptions in `exceptions/`. They are named after the business condition, not the HTTP status — `SlotNotAvailableException`, not `BookingConflictException`. The name should tell a reader what went wrong in the domain.

---

## 3. Global Exception Filter

```ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    // 1. AppException            → use its code, status and details
    // 2. HttpException           → map the built-in status to a code
    // 3. Prisma known errors     → map (see §5)
    // 4. anything else           → 500 INTERNAL_SERVER_ERROR, generic message
    //
    // 5xx  → logger.error with the stack and the full context
    // 4xx  → logger.warn  with route, userId and code (no body)
    // response body never contains the stack in production
  }
}
```

Registered as the last global filter so it catches everything, including errors thrown from guards, pipes and interceptors.

---

## 4. Error Code Registry

Codes are unique across the API and are exported as a single const object consumed by both the server and the generated client types.

### Authentication — 401 / 403

| Code                           | Status | Meaning                                            |
| ------------------------------ | ------ | -------------------------------------------------- |
| `UNAUTHORIZED`                 | 401    | Missing or malformed credentials                   |
| `INVALID_CREDENTIALS`          | 401    | Wrong email or password (deliberately ambiguous)   |
| `TOKEN_EXPIRED`                | 401    | Access token past `exp`                            |
| `INVALID_REFRESH_TOKEN`        | 401    | Unknown, expired or revoked refresh token          |
| `REFRESH_TOKEN_REUSED`         | 401    | Reuse detected; the whole family was revoked       |
| `ACCOUNT_BLOCKED`              | 403    | Admin sanction                                     |
| `ACCOUNT_INACTIVE`             | 403    | Deactivated account                                |
| `INVALID_RESET_TOKEN`          | 400    | Password reset token invalid, expired or used      |
| `PASSWORD_REUSED`              | 422    | New password equals the current one                |
| `INVALID_VERIFICATION_TOKEN`   | 400    | Email verification token invalid, expired or used  |
| `EMAIL_ALREADY_VERIFIED`       | 409    | Resend requested for an already-verified address   |
| `INVALID_TOTP_CODE`            | 401    | TOTP code did not match                            |
| `TOTP_ALREADY_ENABLED`         | 409    | Setup/enable requested, 2FA already on             |
| `TOTP_NOT_ENABLED`             | 409    | Disable requested, 2FA is not on                   |
| `TOTP_SETUP_NOT_STARTED`       | 409    | Enable requested before setup                      |
| `INVALID_TWO_FACTOR_CHALLENGE` | 401    | Login challenge invalid, expired or used           |
| `SESSION_NOT_FOUND`            | 404    | Session (device) id unknown or not owned by caller |
| `FORBIDDEN`                    | 403    | Role does not permit this operation                |

### Registration & users

| Code                           | Status |
| ------------------------------ | ------ |
| `EMAIL_ALREADY_EXISTS`         | 409    |
| `PHONE_ALREADY_EXISTS`         | 409    |
| `USER_NOT_FOUND`               | 404    |
| `CITY_NOT_FOUND`               | 404    |
| `SAVED_ADDRESS_NOT_FOUND`      | 404    |
| `SAVED_ADDRESS_LIMIT_EXCEEDED` | 422    |

### Masters & moderation

| Code                            | Status | Meaning                                         |
| ------------------------------- | ------ | ----------------------------------------------- |
| `MASTER_NOT_FOUND`              | 404    |                                                 |
| `MASTER_NOT_APPROVED`           | 403    | Operation requires an approved master           |
| `MASTER_UNAVAILABLE`            | 409    | Deactivated or blocked; cannot receive bookings |
| `MASTER_NOT_READY_FOR_APPROVAL` | 409    | No category or no active service (BR-15)        |
| `INVALID_APPROVAL_TRANSITION`   | 409    | e.g. approving an already-approved master       |
| `REASON_REQUIRED`               | 422    | Rejection/cancellation without a reason         |

### Categories & services

| Code                            | Status |
| ------------------------------- | ------ |
| `CATEGORY_NOT_FOUND`            | 404    |
| `CATEGORY_NOT_LEAF`             | 422    |
| `CATEGORY_DEPTH_EXCEEDED`       | 422    |
| `CATEGORY_IN_USE`               | 409    |
| `CATEGORY_SLUG_TAKEN`           | 409    |
| `CATEGORY_INVALID_PARENT`       | 422    |
| `SERVICE_NOT_FOUND`             | 404    |
| `SERVICE_INVALID`               | 422    |
| `SERVICE_CATEGORY_NOT_ATTACHED` | 422    |

### Scheduling

| Code                       | Status |
| -------------------------- | ------ |
| `SCHEDULE_OVERLAP`         | 422    |
| `INVALID_TIME_RANGE`       | 422    |
| `EXCEPTION_ALREADY_EXISTS` | 409    |
| `DATE_RANGE_TOO_LARGE`     | 422    |

### Bookings

| Code                         | Status | Meaning                                            |
| ---------------------------- | ------ | -------------------------------------------------- |
| `BOOKING_NOT_FOUND`          | 404    | Also returned when the caller is not a participant |
| `SLOT_NOT_AVAILABLE`         | 409    | Outside availability or already taken              |
| `SLOT_TOO_SOON`              | 422    | Less than the 2-hour lead time                     |
| `BOOKING_OVERLAP`            | 409    | Lost the race at acceptance                        |
| `CLIENT_SLOT_CONFLICT`       | 409    | Client already has a booking in that window        |
| `TOO_MANY_PENDING_BOOKINGS`  | 429    | More than 5 open requests                          |
| `ILLEGAL_BOOKING_TRANSITION` | 409    | Not permitted by the state machine                 |
| `TOO_EARLY_TO_START`         | 422    | Earlier than 30 minutes before the slot            |
| `BOOKING_NOT_COMPLETED`      | 409    | Review attempted on a non-completed booking        |
| `RESCHEDULE_WINDOW_CLOSED`   | 422    | Less than 24h before the booking's current slot    |
| `RESCHEDULE_LIMIT_EXCEEDED`  | 409    | Booking has already been rescheduled once (B-51)   |

### Reviews

| Code                        | Status |
| --------------------------- | ------ |
| `REVIEW_NOT_FOUND`          | 404    |
| `REVIEW_ALREADY_EXISTS`     | 409    |
| `REVIEW_WINDOW_CLOSED`      | 409    |
| `REVIEW_EDIT_WINDOW_CLOSED` | 409    |
| `REPLY_ALREADY_EXISTS`      | 409    |

### Files & chat

| Code                     | Status |
| ------------------------ | ------ |
| `FILE_NOT_FOUND`         | 404    |
| `INVALID_FILE`           | 422    |
| `FILE_TOO_LARGE`         | 422    |
| `UNSUPPORTED_MIME_TYPE`  | 422    |
| `FILE_NOT_CONFIRMED`     | 409    |
| `CONVERSATION_NOT_FOUND` | 404    |
| `NO_SHARED_BOOKING`      | 403    |
| `MESSAGE_TOO_LONG`       | 422    |

### Banners

| Code               | Status |
| ------------------ | ------ |
| `BANNER_NOT_FOUND` | 404    |

### Idempotency (Phase 6)

| Code                          | Status | Meaning                                              |
| ----------------------------- | ------ | ---------------------------------------------------- |
| `IDEMPOTENCY_KEY_REUSED`      | 409    | Same `Idempotency-Key`, a different method/path/body |
| `IDEMPOTENCY_KEY_IN_PROGRESS` | 409    | The original request with this key is still running  |

### Generic

| Code                    | Status |
| ----------------------- | ------ |
| `VALIDATION_FAILED`     | 422    |
| `INVALID_REFERENCE`     | 422    |
| `CONFLICT`              | 409    |
| `BAD_REQUEST`           | 400    |
| `NOT_FOUND`             | 404    |
| `TOO_MANY_REQUESTS`     | 429    |
| `INTERNAL_SERVER_ERROR` | 500    |
| `SERVICE_UNAVAILABLE`   | 503    |

---

## 5. Prisma Error Mapping

Raw Prisma errors never reach a client — they expose column and constraint names.

| Prisma code       | Meaning                                | Mapped to                                                                               |
| ----------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| `P2002`           | Unique constraint violated             | `409` with a code derived from the constraint target (`email` → `EMAIL_ALREADY_EXISTS`) |
| `P2003`           | Foreign key constraint failed          | `422 INVALID_REFERENCE`                                                                 |
| `P2025`           | Record not found                       | `404 NOT_FOUND` (refined by the calling repository)                                     |
| `P2034`           | Transaction write conflict / deadlock  | Retried up to 3 times with jittered backoff; if still failing → `409 CONFLICT`          |
| `23P01` (raw)     | Exclusion constraint (booking overlap) | `409 BOOKING_OVERLAP`                                                                   |
| Connection errors | Pool exhausted, database unreachable   | `503 SERVICE_UNAVAILABLE`, readiness probe fails                                        |

The exclusion-constraint mapping matters: the GiST constraint from `DATABASE.md` §7.1 is the last line of defence against double-booking, and when it fires the client must receive a meaningful `BOOKING_OVERLAP`, not a `500`.

---

## 6. Logging Policy

| Class                                    | Level   | Logged                                                             |
| ---------------------------------------- | ------- | ------------------------------------------------------------------ |
| 4xx client errors                        | `warn`  | method, path, status, `code`, `userId`, `requestId`                |
| 401/403                                  | `warn`  | plus IP — repeated failures feed alerting                          |
| 429                                      | `warn`  | plus the throttle key                                              |
| 5xx                                      | `error` | full stack, `requestId`, `userId`, route; **not** the request body |
| Unhandled rejection / uncaught exception | `fatal` | logged, reported, then graceful shutdown                           |

Never logged: passwords, tokens, hashes, reset tokens, full request bodies of auth endpoints, `Authorization` headers. The redaction list is centralised in the logger configuration, not applied at call sites.

---

## 7. Retry Guidance for Clients

| Status                  | Retry?                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- |
| 400, 401, 403, 404, 422 | ❌ never — retrying an identical request cannot succeed                           |
| 409                     | ⚠️ only after re-reading state (e.g. fetch fresh availability, pick another slot) |
| 429                     | ✅ after `Retry-After`                                                            |
| 500                     | ⚠️ once, with backoff                                                             |
| 503                     | ✅ with exponential backoff and jitter                                            |

`POST /bookings` and `POST /admin/notifications/broadcast` (Phase 6) accept an optional `Idempotency-Key` header: a retried request with the same key, method, path and body replays the original response instead of running again. Any other mutating endpoint still has no such guard, so a timed-out request there must be treated as indeterminate and reconciled by re-reading state.

---

## 8. Rules for Engineers

- ✅ Throw a named domain exception from the service layer
- ✅ Add the code to the registry in this document in the same commit
- ✅ Document the error in the endpoint's `@ApiResponse`
- ✅ Cover the failure path with a test
- ❌ Never `throw new Error('something went wrong')` in business code
- ❌ Never `catch` and swallow; if you catch, you either handle or rethrow with context
- ❌ Never include a raw ORM or SQL message in a response
- ❌ Never introduce a new error shape — there is exactly one envelope
