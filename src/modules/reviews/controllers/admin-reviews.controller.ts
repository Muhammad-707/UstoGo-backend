import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { Audit } from '../../audit/decorators/audit.decorator';
import { ReasonDto } from '../../masters/dto/requests/reason.dto';
import { ReviewResponseDto } from '../dto/responses/review.response.dto';
import { ReviewsService } from '../services/reviews.service';

const REVIEW_NOT_FOUND = { description: 'REVIEW_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Admin')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'List every review', description: 'Includes hidden.' })
  @ApiPaginatedResponse(ReviewResponseDto)
  async list(@Query() query: PaginationQueryDto): Promise<PaginatedDto<ReviewResponseDto>> {
    const { items, total } = await this.reviews.listForAdmin(query.page, query.limit);

    return PaginatedDto.from(
      items.map((item) => ReviewResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Post(':id/hide')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.REVIEW_HIDDEN, 'Review')
  @ApiOperation({ summary: 'Hide a review', description: 'Aggregates recomputed (FR-8.4).' })
  @ApiOkResponse({ type: ReviewResponseDto })
  @ApiNotFoundResponse(REVIEW_NOT_FOUND)
  async hide(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviews.hide(id, admin.id, dto.reason);
    return ReviewResponseDto.fromEntity(review);
  }

  @Post(':id/unhide')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.REVIEW_UNHIDDEN, 'Review')
  @ApiOperation({ summary: 'Unhide a review', description: 'Aggregates recomputed (FR-8.4).' })
  @ApiOkResponse({ type: ReviewResponseDto })
  @ApiNotFoundResponse(REVIEW_NOT_FOUND)
  async unhide(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<ReviewResponseDto> {
    const review = await this.reviews.unhide(id, admin.id);
    return ReviewResponseDto.fromEntity(review);
  }
}
