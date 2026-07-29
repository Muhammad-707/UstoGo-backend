import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
import { PaginatedDto } from '@common/dto/paginated.dto';

import { PublicReviewsQueryDto, ReviewSort } from '../dto/requests/public-reviews-query.dto';
import { PublicReviewsResponseDto } from '../dto/responses/public-reviews.response.dto';
import { ReviewResponseDto } from '../dto/responses/review.response.dto';
import { ReviewsService } from '../services/reviews.service';

/** `GET /masters/:id/reviews` (FR-8.5, API.md §7) — public, owned by `ReviewsModule`. */
@ApiTags('Masters')
@Controller('masters/:id/reviews')
export class MasterReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'A master’s visible reviews, with the rating distribution' })
  @ApiOkResponse({ type: PublicReviewsResponseDto })
  async list(
    @Param('id') id: string,
    @Query() query: PublicReviewsQueryDto,
  ): Promise<PublicReviewsResponseDto> {
    const { items, total, distribution } = await this.reviews.publicListing(
      id,
      query.page,
      query.limit,
      query.sort === ReviewSort.RATING,
    );

    const page = PaginatedDto.from(
      items.map((item) => ReviewResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );

    return Object.assign(new PublicReviewsResponseDto(), page, { distribution });
  }
}
