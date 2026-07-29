import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const);

/**
 * Common query parameters from API.md §1.5.
 *
 * `@Type(() => Number)` is mandatory on every field: query strings arrive as strings,
 * and the global pipe runs with `enableImplicitConversion: false` precisely so that
 * each conversion is a decision rather than a coercion (VALIDATION.md §1).
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: PAGINATION.DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = PAGINATION.DEFAULT_PAGE;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PAGINATION.MAX_LIMIT,
    default: PAGINATION.DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_LIMIT)
  limit: number = PAGINATION.DEFAULT_LIMIT;

  /** Rows to skip. Derived rather than accepted, so a client cannot bypass the cap. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
