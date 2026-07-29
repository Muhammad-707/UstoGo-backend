import { ApiProperty } from '@nestjs/swagger';

import { PaginatedDto } from '@common/dto/paginated.dto';

import { ReviewResponseDto } from './review.response.dto';

/** `{1..5: count}` — the rating distribution FR-8.5 requires alongside the listing. */
export class RatingDistributionDto {
  @ApiProperty()
  '1'!: number;

  @ApiProperty()
  '2'!: number;

  @ApiProperty()
  '3'!: number;

  @ApiProperty()
  '4'!: number;

  @ApiProperty()
  '5'!: number;
}

/** `GET /masters/:id/reviews` (FR-8.5) — the paginated envelope plus the distribution. */
export class PublicReviewsResponseDto extends PaginatedDto<ReviewResponseDto> {
  @ApiProperty({ type: RatingDistributionDto })
  distribution!: RatingDistributionDto;
}
