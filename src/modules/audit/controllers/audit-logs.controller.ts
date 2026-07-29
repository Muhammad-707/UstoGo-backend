import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { PaginatedDto } from '@common/dto/paginated.dto';

import { AuditLogQueryDto } from '../dto/requests/audit-log-query.dto';
import { AuditLogResponseDto } from '../dto/responses/audit-log.response.dto';
import { AuditService } from '../services/audit.service';

@ApiTags('Admin')
@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List audit log entries',
    description:
      'Every privileged mutation writes an append-only row here (SECURITY.md §2.9). ' +
      'Filterable by actor, action, entity and a createdAt range.',
  })
  @ApiPaginatedResponse(AuditLogResponseDto)
  async list(@Query() query: AuditLogQueryDto): Promise<PaginatedDto<AuditLogResponseDto>> {
    const { items, total } = await this.audit.list(query);

    return PaginatedDto.from(
      items.map((item) => AuditLogResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }
}
