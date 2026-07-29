import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { CreateReviewDto } from '../dto/requests/create-review.dto';
import { ReplyReviewDto } from '../dto/requests/reply-review.dto';
import { UpdateReviewDto } from '../dto/requests/update-review.dto';
import { ReviewReplyResponseDto } from '../dto/responses/review-reply.response.dto';
import { ReviewResponseDto } from '../dto/responses/review.response.dto';
import { ReviewReplyService } from '../services/review-reply.service';
import { ReviewsService } from '../services/reviews.service';

const REVIEW_NOT_FOUND = { description: 'REVIEW_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly reply: ReviewReplyService,
  ) {}

  @Post()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Review a completed booking', description: 'FR-8.1.' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiConflictResponse({
    description: 'BOOKING_NOT_COMPLETED | REVIEW_ALREADY_EXISTS | REVIEW_WINDOW_CLOSED',
    type: ErrorResponseDto,
  })
  async create(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviews.create(user.id, dto);
    return ReviewResponseDto.fromEntity(review);
  }

  @Patch(':id')
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Edit the caller’s own review', description: 'Within 24 hours.' })
  @ApiOkResponse({ type: ReviewResponseDto })
  @ApiNotFoundResponse(REVIEW_NOT_FOUND)
  @ApiConflictResponse({ description: 'REVIEW_EDIT_WINDOW_CLOSED', type: ErrorResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviews.update(user.id, id, dto);
    return ReviewResponseDto.fromEntity(review);
  }

  @Get('me')
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'The caller’s own reviews' })
  @ApiPaginatedResponse(ReviewResponseDto)
  async listMine(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDto<ReviewResponseDto>> {
    const { items, total } = await this.reviews.listMine(user.id, query.page, query.limit);

    return PaginatedDto.from(
      items.map((item) => ReviewResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get('received')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Reviews about the caller' })
  @ApiPaginatedResponse(ReviewResponseDto)
  async listReceived(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDto<ReviewResponseDto>> {
    const { items, total } = await this.reviews.listReceived(user.id, query.page, query.limit);

    return PaginatedDto.from(
      items.map((item) => ReviewResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Post(':id/reply')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Reply to a review', description: 'One reply per review.' })
  @ApiCreatedResponse({ type: ReviewReplyResponseDto })
  @ApiNotFoundResponse(REVIEW_NOT_FOUND)
  @ApiConflictResponse({ description: 'REPLY_ALREADY_EXISTS', type: ErrorResponseDto })
  async replyTo(
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewReplyResponseDto> {
    const created = await this.reply.reply(user.id, id, dto.body);
    return ReviewReplyResponseDto.fromEntity(created);
  }
}
