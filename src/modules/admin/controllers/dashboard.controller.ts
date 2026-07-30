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
import { DashboardResponseDto } from '../dto/responses/dashboard.response.dto';
import { DashboardService } from '../services/dashboard.service';

@ApiTags('Admin')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Aggregate platform metrics',
    description:
      'User/master/booking counts, completion/cancellation/acceptance rates, review ' +
      'aggregate, top 10 categories by booking volume and a daily booking time series ' +
      '(FR-11.1). `from`/`to` are independently optional; a missing bound defaults to a ' +
      '30-day window, capped at 366 days.',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'DATE_RANGE_TOO_LARGE', type: ErrorResponseDto })
  async get(@Query() query: DashboardQueryDto): Promise<DashboardResponseDto> {
    return this.dashboard.getDashboard(query);
  }
}
