import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { Audit } from '../../audit/decorators/audit.decorator';
import { AdminReportQueryDto } from '../dto/requests/admin-report-query.dto';
import { ResolveReportDto } from '../dto/requests/resolve-report.dto';
import { AdminReportResponseDto } from '../dto/responses/report.response.dto';
import { ReportsService } from '../services/reports.service';

const NOT_FOUND = { description: 'REPORT_NOT_FOUND', type: ErrorResponseDto };

/** §6.8 (MASTER_PROMPT.md). */
@ApiTags('Admin')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List reports for moderation',
    description: 'Filterable by status; omit to see every report.',
  })
  @ApiPaginatedResponse(AdminReportResponseDto)
  async list(@Query() query: AdminReportQueryDto): Promise<PaginatedDto<AdminReportResponseDto>> {
    const { items, total } = await this.reports.listForAdmin(query);

    return PaginatedDto.from(
      items.map((item) => AdminReportResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.REPORT_RESOLVED, 'Report')
  @ApiOperation({
    summary: 'Resolve or reject a report',
    description:
      'A terminal decision (`RESOLVED`/`REJECTED`) with an optional note. To act on a ' +
      'confirmed report, block the offending account separately via ' +
      'POST /admin/users/:id/block.',
  })
  @ApiOkResponse({ type: AdminReportResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse({ description: 'REPORT_ALREADY_RESOLVED', type: ErrorResponseDto })
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<AdminReportResponseDto> {
    const report = await this.reports.resolve(id, admin.id, dto);

    return AdminReportResponseDto.fromEntity(report);
  }
}
