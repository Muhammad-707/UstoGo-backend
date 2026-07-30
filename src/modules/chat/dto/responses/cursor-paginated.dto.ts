import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The cursor-pagination envelope for `GET /conversations/:id/messages`. `items` is
 * declared by `@ApiCursorPaginatedResponse(Model)` rather than here, same reasoning
 * as `PaginatedDto` (DATABASE.md §9.2, API.md §11).
 */
export class CursorPaginatedDto<T> {
  items!: T[];

  @ApiPropertyOptional({ nullable: true, description: 'Pass as `cursor` for the next page.' })
  nextCursor!: string | null;

  @ApiProperty()
  hasMore!: boolean;

  static from<T>(items: T[], nextCursor: string | null): CursorPaginatedDto<T> {
    return { items, nextCursor, hasMore: nextCursor !== null };
  }
}
