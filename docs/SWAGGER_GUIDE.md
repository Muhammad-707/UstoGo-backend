# Swagger / OpenAPI Guide — UstoGo

**Version:** 1.0.0 · **Spec:** OpenAPI 3.1 · **Last updated:** 2026-07-29
**URL:** `/api/docs` (UI) · `/api/docs-json` (raw document)

The OpenAPI document is **generated from code**, never hand-written. A hand-maintained spec drifts within weeks; a generated one cannot.

---

## 1. Bootstrap

```ts
// src/bootstrap/swagger.ts
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('UstoGo API')
    .setDescription('Marketplace API connecting clients with professional craftsmen.')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token from /auth/login' },
      'access-token',
    )
    .addTag('Auth', 'Registration, login, sessions, passwords')
    .addTag('Users', 'Own profile and account')
    .addTag('Files', 'Presigned uploads')
    .addTag('Categories', 'Public category tree')
    .addTag('Masters', 'Public master discovery')
    .addTag('Master Cabinet', 'Master self-service (role: MASTER)')
    .addTag('Bookings', 'Booking lifecycle')
    .addTag('Reviews', 'Ratings and reviews')
    .addTag('Notifications', 'In-app notifications')
    .addTag('Chat', 'Client ↔ master messaging')
    .addTag('Banners', 'Public promotional content')
    .addTag('Admin', 'Administration and moderation (role: ADMIN)')
    .addTag('Health', 'Liveness and readiness')
    .addServer('http://localhost:3000', 'Local')
    .addServer('https://api.staging.ustogo.app', 'Staging')
    .addServer('https://api.ustogo.app', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config, { operationIdFactory: (_c, m) => m });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', docExpansion: 'none', filter: true },
    customSiteTitle: 'UstoGo API Docs',
  });
}
```

**Production exposure.** In production the UI is served only behind an authenticated gateway route, or disabled entirely by `SWAGGER_ENABLED=false`. An open schema is a free map of the attack surface. Staging is open to the team.

---

## 2. Controller Annotation Standard

Every controller and every route is annotated. An undocumented endpoint fails review.

```ts
@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller('bookings')
export class BookingsController {
  @Post()
  @Roles(UserRole.CLIENT)
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Creates a booking in PENDING status. The slot must be inside the master\'s computed availability ' +
      'and at least 2 hours in the future. The master is notified immediately.',
  })
  @ApiCreatedResponse({ type: BookingResponseDto })
  @ApiConflictResponse({ description: 'SLOT_NOT_AVAILABLE | CLIENT_SLOT_CONFLICT | MASTER_UNAVAILABLE', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION_FAILED | SLOT_TOO_SOON | SERVICE_INVALID', type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'MASTER_NOT_FOUND', type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ description: 'TOO_MANY_PENDING_BOOKINGS', type: ErrorResponseDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookingDto): Promise<BookingResponseDto> { … }
}
```

Rules
1. `@ApiTags` on the class, matching a tag declared in the builder.
2. `@ApiBearerAuth('access-token')` on every protected class; `@ApiExcludeEndpoint()` never used to hide a real endpoint.
3. `@ApiOperation` with a summary in the imperative mood and a description covering preconditions and side effects.
4. A success response decorator with an explicit `type`.
5. **Every** error the endpoint can produce, with its `code` listed in the description. Alternatives are separated by `|`.
6. `@ApiParam` and `@ApiQuery` for anything not inferable from a DTO.

---

## 3. DTO Annotation Standard

```ts
export class CreateServiceDto {
  @ApiProperty({ example: 'Kitchen tap replacement', minLength: 3, maxLength: 200 })
  @IsString() @Length(3, 200)
  title!: string;

  @ApiProperty({ enum: PriceType, example: PriceType.FIXED, enumName: 'PriceType' })
  @IsEnum(PriceType)
  priceType!: PriceType;

  @ApiProperty({ example: 150000, minimum: 0.01, description: 'Amount in the deployment currency' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  price!: number;

  @ApiProperty({ example: 60, minimum: 15, maximum: 1440, description: 'Must be a multiple of 15' })
  @IsInt() @Min(15) @Max(1440) @IsMultipleOf(15)
  durationMinutes!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;
}
```

- `enumName` is mandatory on enums, otherwise the generator emits anonymous inline enums and client codegen produces unusable types.
- Realistic `example` values on every property — the examples are what a client developer actually copies.
- `@ApiPropertyOptional` for optional fields; never `required: false` on `@ApiProperty`.
- Response DTOs are annotated too, with `@ApiProperty({ type: () => Xxx })` for nested objects to avoid circular-reference failures.

---

## 4. Shared Response Schemas

**Error** — declared once and referenced everywhere:

```ts
export class ErrorResponseDto {
  @ApiProperty({ example: 409 }) statusCode!: number;
  @ApiProperty({ example: 'SLOT_NOT_AVAILABLE' }) code!: string;
  @ApiProperty({ example: 'The requested time slot is no longer available.' }) message!: string;
  @ApiProperty({ type: [ErrorDetailDto], example: [] }) details!: ErrorDetailDto[];
  @ApiProperty({ example: '/api/v1/bookings' }) path!: string;
  @ApiProperty({ example: '2026-07-29T10:15:00.000Z' }) timestamp!: string;
  @ApiProperty({ example: '01J9X4K7QW8ZP2' }) requestId!: string;
}
```

**Pagination** — a generic helper keeps every list endpoint typed:

```ts
export const ApiPaginatedResponse = <T extends Type<unknown>>(model: T) =>
  applyDecorators(
    ApiExtraModels(PaginatedDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedDto) },
          { properties: { items: { type: 'array', items: { $ref: getSchemaPath(model) } } } },
        ],
      },
    }),
  );
```

Usage: `@ApiPaginatedResponse(MasterListItemDto)`.

---

## 5. Documenting Authorization

Because `USER_ROLES.md` is normative, the spec must reflect it. A custom decorator keeps the two aligned:

```ts
export const ApiAuth = (...roles: UserRole[]) =>
  applyDecorators(
    ApiBearerAuth('access-token'),
    Roles(...roles),
    ApiUnauthorizedResponse({ description: 'UNAUTHORIZED | TOKEN_EXPIRED', type: ErrorResponseDto }),
    ApiForbiddenResponse({ description: `FORBIDDEN — requires role: ${roles.join(', ')}`, type: ErrorResponseDto }),
  );
```

One decorator sets the guard metadata *and* documents it, so the spec cannot disagree with the enforcement.

---

## 6. Grouping and Discoverability

- Public endpoints are tagged normally and marked "Public — no authentication required" in the description.
- Master self-service lives under **Master Cabinet** rather than mixed into **Masters**, because the audience is different: one tag is for consumers browsing, the other for the provider app.
- All admin endpoints carry the **Admin** tag and a `/admin` path prefix, so an integrator can see the privileged surface at a glance.

---

## 7. Client Code Generation

```bash
npm run swagger:export        # writes openapi.json without booting the HTTP listener
npx openapi-typescript openapi.json -o ../frontend/src/api/schema.d.ts
```

Requirements for the exported document to be usable:
- `operationIdFactory` yields stable, unique operation ids (the method name)
- Every enum has an `enumName`
- Every response has an explicit `type`
- No inline anonymous object schemas in responses

`openapi.json` is committed and diffed in CI: an unintended breaking change to the public contract shows up as a reviewable diff rather than a surprise in a client release.

---

## 8. Checklist

- [ ] Controller has `@ApiTags` and `@ApiBearerAuth` where protected
- [ ] Every route has `@ApiOperation` with preconditions and side effects
- [ ] Success response has an explicit DTO type
- [ ] Every possible error status is documented with its `code`
- [ ] Every DTO property has `@ApiProperty`/`@ApiPropertyOptional` with an example
- [ ] Enums use `enumName`
- [ ] List endpoints use `@ApiPaginatedResponse`
- [ ] `npm run swagger:export` succeeds and the committed `openapi.json` diff is intentional
