import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

export enum ReviewSort {
  RECENCY = 'recency',
  RATING = 'rating',
}

/** `GET /masters/:id/reviews` (FR-8.5) — visible reviews only, public. */
export class PublicReviewsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReviewSort, default: ReviewSort.RECENCY })
  @IsOptional()
  @IsEnum(ReviewSort)
  sort?: ReviewSort;
}
