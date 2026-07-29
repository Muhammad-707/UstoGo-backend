import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 137 })
  total!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  @ApiProperty({ example: false })
  hasPrev!: boolean;
}

/**
 * The collection envelope from API.md §1.3. `items` is declared by
 * `@ApiPaginatedResponse(Model)` rather than here, because the element type differs per
 * endpoint and OpenAPI needs the concrete schema.
 */
export class PaginatedDto<T> {
  items!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  static from<T>(items: T[], total: number, page: number, limit: number): PaginatedDto<T> {
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }
}
