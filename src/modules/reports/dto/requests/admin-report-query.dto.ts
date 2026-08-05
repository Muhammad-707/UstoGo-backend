import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

/** `GET /admin/reports` (MASTER_PROMPT.md §6.8). */
export class AdminReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ReportStatus,
    enumName: 'ReportStatus',
    description: 'Omit to list every report; defaults to none (all statuses) at the API level.',
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
