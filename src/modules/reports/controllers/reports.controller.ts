import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { CreateReportDto } from '../dto/requests/create-report.dto';
import { ReportResponseDto } from '../dto/responses/report.response.dto';
import { ReportsService } from '../services/reports.service';

/** §6.8 (MASTER_PROMPT.md). Any authenticated client or master may file one. */
@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiAuth(UserRole.CLIENT, UserRole.MASTER)
  @ApiOperation({ summary: 'File a report against another user' })
  @ApiCreatedResponse({ type: ReportResponseDto })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ErrorResponseDto })
  async create(
    @Body() dto: CreateReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReportResponseDto> {
    const report = await this.reports.create(user.id, dto);

    return ReportResponseDto.fromEntity(report);
  }
}
