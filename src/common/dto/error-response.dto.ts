import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({ example: 'email', description: 'Dot path; array elements use indices' })
  field!: string;

  @ApiProperty({ type: [String], example: ['email must be an email'] })
  constraints!: string[];
}

/**
 * The single error envelope for the entire API (ERROR_HANDLING.md §1). Declared as a
 * DTO so that every `@ApiResponse` can reference one schema and the generated OpenAPI
 * document cannot drift from what the filter actually emits.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 409, description: 'Mirrors the HTTP response status' })
  statusCode!: number;

  @ApiProperty({
    example: 'SLOT_NOT_AVAILABLE',
    description: 'Stable identifier. Clients branch on this, never on `message`.',
  })
  code!: string;

  @ApiProperty({
    example: 'The requested time slot is no longer available.',
    description: 'English, developer-facing. Clients localise from `code`.',
  })
  message!: string;

  @ApiProperty({ type: [ErrorDetailDto], description: 'Populated for 422; empty otherwise' })
  details!: ErrorDetailDto[];

  @ApiProperty({ example: '/api/v1/bookings', description: 'Path without the query string' })
  path!: string;

  @ApiProperty({ example: '2026-07-29T10:15:00.000Z', description: 'ISO-8601 UTC' })
  timestamp!: string;

  @ApiProperty({
    example: '3f1a2b8c-9d4e-4f60-8a1b-2c3d4e5f6a7b',
    description: 'Correlates to logs and to the X-Request-Id header',
  })
  requestId!: string;
}
