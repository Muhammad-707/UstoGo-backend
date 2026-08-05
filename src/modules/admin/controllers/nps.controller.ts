import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';

import { DashboardQueryDto } from '../dto/requests/dashboard-query.dto';
import { NpsResponseDto } from '../dto/responses/nps.response.dto';
import { NpsService } from '../services/nps.service';

@ApiTags('Admin')
@Controller('admin/nps')
export class NpsController {
  constructor(private readonly nps: NpsService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Platform-wide NPS',
    description:
      'Overall NPS plus breakdown by category and by (top 10) master (MASTER_PROMPT.md ' +
      '§6.1). `from`/`to` independently optional, same 30-day-default/366-day-cap as ' +
      '`GET /admin/dashboard`.',
  })
  @ApiOkResponse({ type: NpsResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'DATE_RANGE_TOO_LARGE', type: ErrorResponseDto })
  async get(@Query() query: DashboardQueryDto): Promise<NpsResponseDto> {
    return this.nps.getNps(query);
  }
}
