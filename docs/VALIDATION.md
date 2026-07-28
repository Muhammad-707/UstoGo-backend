# Validation — UstoGo

**Version:** 1.0.0 · **Last updated:** 2026-07-29

**Principle:** the application never trusts input. Every byte that crosses the HTTP boundary is validated, transformed and whitelisted before any business code sees it.

---

## 1. Global Pipe Configuration

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,               // strip properties without a decorator
    forbidNonWhitelisted: true,    // 422 when unknown properties are present
    transform: true,               // instantiate the DTO class
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,       // report every violation at once
    validationError: { target: false, value: false }, // never echo input back
    exceptionFactory: (errors) => new ValidationFailedException(errors),
  }),
);
```

Each setting earns its place:

| Setting | Why |
| --- | --- |
| `whitelist` | An undecorated property cannot reach a service, so mass-assignment is structurally impossible. |
| `forbidNonWhitelisted` | Silent stripping hides client bugs; a loud `422` surfaces them during integration. |
| `transform` | Services receive real class instances with working `Date` and `Decimal` types, not raw JSON. |
| `enableImplicitConversion: false` | Implicit coercion turns `"abc"` into `NaN` and `"0"` into `false`. Every conversion is explicit via `@Type()` or `@Transform()`. |
| `stopAtFirstError: false` | A form should surface all its errors in one round trip. |
| `validationError.value: false` | Prevents a rejected password from being echoed into an error body and then into a log. |

**`role` injection is defeated by `whitelist` alone:** `RegisterClientDto` has no `role` property, so `{"role":"ADMIN"}` is stripped before the service runs — and with `forbidNonWhitelisted` it is rejected outright.

---

## 2. DTO Rules

1. One DTO per operation. `CreateBookingDto` and `UpdateBookingDto` are separate classes even when they overlap.
2. DTOs are plain classes with decorators — no logic, no methods, no database access.
3. Request DTOs live in `dto/requests/`, response DTOs in `dto/responses/`.
4. Every property carries `@ApiProperty()` so the OpenAPI document is generated, not hand-written.
5. Update DTOs derive from create DTOs: `export class UpdateServiceDto extends PartialType(CreateServiceDto) {}`.
6. Response DTOs are explicit classes with `@Exclude()` defaults — entities are never serialised directly.

### Example

```ts
export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  masterId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  serviceId!: string;

  @ApiProperty({ example: '2026-08-03T09:00:00.000Z', description: 'UTC slot start' })
  @IsISO8601({ strict: true })
  @IsFutureDate({ minLeadMinutes: 120 })   // custom constraint, §5
  scheduledAt!: string;

  @ApiProperty({ type: () => AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  note?: string;
}
```

`@ValidateNested()` **must** be paired with `@Type()`; without it the nested object is a plain literal and its decorators never run. This is the single most common validation bug in NestJS codebases and is an explicit review checklist item.

---

## 3. Field Rule Reference

### Identity
| Field | Rules |
| --- | --- |
| `email` | `@IsEmail()`, `@MaxLength(255)`, `@Transform(v => v.trim().toLowerCase())` |
| `password` | `@IsString()`, `@MinLength(8)`, `@MaxLength(72)`, `@Matches(/(?=.*[A-Za-z])(?=.*\d)/)` |
| `phone` | `@IsPhoneNumber(null)` in E.164, `@MaxLength(20)` |
| `firstName` / `lastName` | `@IsString()`, `@Length(2, 100)`, trimmed |
| `displayName` | `@Length(2, 150)`, trimmed |
| `bio` | `@IsOptional()`, `@MaxLength(2000)` |
| `timezone` | `@IsTimeZone()` (custom, validates against the IANA database) |

### Catalogue
| Field | Rules |
| --- | --- |
| `title` | `@Length(3, 200)` |
| `description` | `@IsOptional()`, `@MaxLength(2000)` |
| `price` | `@IsNumber({ maxDecimalPlaces: 2 })`, `@Min(0.01)`, `@Max(99999999.99)` |
| `priceType` | `@IsEnum(PriceType)` |
| `durationMinutes` | `@IsInt()`, `@Min(15)`, `@Max(1440)`, `@IsMultipleOf(15)` (custom) |
| `categoryId` | `@IsUUID('4')` + service-layer leaf check |
| `slug` | `@Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)`, `@Length(2, 100)` |

### Scheduling
| Field | Rules |
| --- | --- |
| `weekday` | `@IsInt()`, `@Min(0)`, `@Max(6)` |
| `startTime` / `endTime` | `@Matches(/^([01]\d|2[0-3]):[0-5]\d$/)` |
| `date` | `@IsDateString({ strict: true })`, date-only |
| range `from`/`to` | `@IsISO8601()` + class-level `@MaxRangeDays(31)` |

### Booking & review
| Field | Rules |
| --- | --- |
| `scheduledAt` | ISO-8601 UTC, ≥ now + 2 h |
| `reason` | `@Length(10, 500)` when required |
| `rating` | `@IsInt()`, `@Min(1)`, `@Max(5)` |
| `comment` | `@IsOptional()`, `@MaxLength(2000)` |

### Pagination
```ts
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;
}
```
`@Type(() => Number)` is mandatory because query strings are always strings.

---

## 4. Sanitisation

| Concern | Handling |
| --- | --- |
| Leading/trailing whitespace | `@Transform(({ value }) => value?.trim())` on every free-text field |
| Case normalisation | Email lowercased at the DTO; the column is `citext` as a second line of defence |
| HTML / script content | Stored as-is, **escaped at render time by the client**. The API does not strip HTML — silently mutating user content is worse than encoding it correctly at the boundary where it becomes dangerous. Content-Type is always `application/json`, never `text/html`. |
| SQL injection | Structurally impossible via Prisma's parameterised queries. Raw SQL (reporting only) uses `Prisma.sql` tagged templates; string concatenation into `$queryRawUnsafe` is banned by an ESLint rule. |
| Unicode tricks | Display names reject zero-width and bidirectional control characters via a custom constraint. |
| Mass assignment | Prevented by `whitelist` + `forbidNonWhitelisted`. |

---

## 5. Custom Validators

Custom constraints live in `src/common/validators/` and are unit-tested independently.

```ts
@ValidatorConstraint({ name: 'isFutureDate', async: false })
export class IsFutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments): boolean {
    const [{ minLeadMinutes = 0 }] = args.constraints as [{ minLeadMinutes?: number }];
    const target = new Date(value);
    if (Number.isNaN(target.getTime())) return false;
    return target.getTime() >= Date.now() + minLeadMinutes * 60_000;
  }
  defaultMessage(args: ValidationArguments): string {
    const [{ minLeadMinutes = 0 }] = args.constraints as [{ minLeadMinutes?: number }];
    return `$property must be at least ${minLeadMinutes} minutes in the future`;
  }
}
```

Catalogue: `@IsFutureDate`, `@IsMultipleOf`, `@IsTimeZone`, `@IsAfterField` (cross-field time comparison), `@MaxRangeDays`, `@IsSafeText`, `@IsE164Phone`.

**Database-dependent checks are not validators.** "Does this category exist?", "is it a leaf?", "does this service belong to this master?" require a query and belong in the service layer, where they raise domain exceptions with precise error codes. A validator that hits the database couples the transport layer to persistence and makes the pipe asynchronous for every request.

---

## 6. Validation vs Business Rules

| Kind | Where | HTTP | Example |
| --- | --- | --- | --- |
| Shape / format | DTO + pipe | `422 VALIDATION_FAILED` | `rating` is not an integer 1–5 |
| Referential | Service | `404` / `422` | `serviceId` does not exist |
| Business invariant | Service / domain | `409` | Slot already taken |
| State machine | `BookingStateMachine` | `409 ILLEGAL_BOOKING_TRANSITION` | Completing a `PENDING` booking |
| Authorization | Guard / service | `401` / `403` / `404` | Master accepting someone else's booking |

Keeping these separated means a `422` always signals a malformed request the client can fix by changing the payload, while a `409` signals a state conflict the client must resolve by re-reading the resource.

---

## 7. Error Format

```json
{
  "statusCode": 422,
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": [
    { "field": "email", "constraints": ["email must be an email"] },
    { "field": "password", "constraints": ["password must be longer than or equal to 8 characters"] },
    { "field": "address.line", "constraints": ["line should not be empty"] }
  ],
  "path": "/api/v1/auth/register/client",
  "timestamp": "2026-07-29T10:15:00.000Z",
  "requestId": "01J9X4K7…"
}
```

Nested fields use dot paths; array elements use indices (`services.0.price`). Submitted values are never echoed.

---

## 8. Checklist for New Endpoints

- [ ] A dedicated request DTO exists (no inline `@Body() body: any`)
- [ ] Every property has a validation decorator and an `@ApiProperty`
- [ ] Nested objects have `@ValidateNested()` **and** `@Type()`
- [ ] Arrays have `@IsArray()`, `@ArrayMaxSize()` and `{ each: true }`
- [ ] Query numbers have `@Type(() => Number)`
- [ ] Free text is trimmed and length-capped
- [ ] Enums use `@IsEnum`, never `@IsString`
- [ ] A response DTO exists; the entity is not returned directly
- [ ] Unit tests cover boundary values (min−1, min, max, max+1)
- [ ] An e2e test asserts `422` with the expected `details` shape
