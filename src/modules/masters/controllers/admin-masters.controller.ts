import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { Audit } from '../../audit/decorators/audit.decorator';
import { AdminMasterSearchQueryDto } from '../dto/requests/admin-master-search-query.dto';
import { ReasonDto } from '../dto/requests/reason.dto';
import { AdminMasterListItemResponseDto } from '../dto/responses/admin-master-list-item.response.dto';
import { MasterStatusResponseDto } from '../dto/responses/master-status.response.dto';
import { MasterModerationService } from '../services/master-moderation.service';
import { MastersSearchService } from '../services/masters-search.service';

const NOT_FOUND = { description: 'MASTER_NOT_FOUND', type: ErrorResponseDto };
const INVALID_TRANSITION = { description: 'INVALID_APPROVAL_TRANSITION', type: ErrorResponseDto };

@ApiTags('Admin')
@Controller('admin/masters')
export class AdminMastersController {
  constructor(
    private readonly moderation: MasterModerationService,
    private readonly mastersSearch: MastersSearchService,
  ) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List masters for moderation and oversight',
    description:
      'Every master regardless of approval/active state — filterable by approvalStatus, status (active/deactivated), cityId, categoryId, search. API.md §12.',
  })
  @ApiPaginatedResponse(AdminMasterListItemResponseDto)
  async list(
    @Query() query: AdminMasterSearchQueryDto,
  ): Promise<PaginatedDto<AdminMasterListItemResponseDto>> {
    const { items, total } = await this.mastersSearch.adminSearch(query);

    return PaginatedDto.from(items, total, query.page, query.limit);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.MASTER_APPROVED, 'MasterProfile')
  @ApiOperation({ summary: 'Approve a pending master', description: 'BR-15 readiness-checked.' })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse({
    description: 'MASTER_NOT_READY_FOR_APPROVAL | INVALID_APPROVAL_TRANSITION',
    type: ErrorResponseDto,
  })
  async approve(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<MasterStatusResponseDto> {
    const master = await this.moderation.approve(id, admin.id);

    return MasterStatusResponseDto.fromEntity(master);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.MASTER_REJECTED, 'MasterProfile')
  @ApiOperation({ summary: 'Reject a pending master' })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiUnprocessableEntityResponse({ description: 'REASON_REQUIRED', type: ErrorResponseDto })
  @ApiConflictResponse(INVALID_TRANSITION)
  async reject(@Param('id') id: string, @Body() dto: ReasonDto): Promise<MasterStatusResponseDto> {
    const master = await this.moderation.reject(id, dto.reason);

    return MasterStatusResponseDto.fromEntity(master);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.MASTER_ACTIVATED, 'MasterProfile')
  @ApiOperation({ summary: 'Reactivate an approved master' })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(INVALID_TRANSITION)
  async activate(@Param('id') id: string): Promise<MasterStatusResponseDto> {
    const master = await this.moderation.activate(id);

    return MasterStatusResponseDto.fromEntity(master);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.MASTER_DEACTIVATED, 'MasterProfile')
  @ApiOperation({
    summary: 'Deactivate an approved master',
    description: 'Hides them from search and blocks new bookings.',
  })
  @ApiOkResponse({ type: MasterStatusResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiUnprocessableEntityResponse({ description: 'REASON_REQUIRED', type: ErrorResponseDto })
  @ApiConflictResponse(INVALID_TRANSITION)
  async deactivate(
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ): Promise<MasterStatusResponseDto> {
    const { master } = await this.moderation.deactivate(id, dto.reason);

    return MasterStatusResponseDto.fromEntity(master);
  }
}
