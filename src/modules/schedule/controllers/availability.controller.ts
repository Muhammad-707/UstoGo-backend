import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';

import { AvailabilityQueryDto } from '../dto/requests/availability-query.dto';
import { DaySlotsResponseDto } from '../dto/responses/day-slots.response.dto';
import { AvailabilityService } from '../services/availability.service';

@ApiTags('Masters')
@Controller('masters/:id')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('availability')
  @Public()
  @ApiOperation({
    summary: 'Computed free and busy slots for a master, grouped by day',
    description:
      'Public. UTC instants grouped by calendar date in the master’s timezone; every ' +
      'date in [from, to] is present with possibly empty arrays (FR-6.3).',
  })
  @ApiOkResponse({ type: DaySlotsResponseDto, isArray: true })
  @ApiUnprocessableEntityResponse({ description: 'DATE_RANGE_TOO_LARGE', type: ErrorResponseDto })
  async availability(
    @Param('id') id: string,
    @Query() query: AvailabilityQueryDto,
  ): Promise<DaySlotsResponseDto[]> {
    const days = await this.availabilityService.computeWithBusy(
      id,
      query.from,
      query.to,
      query.serviceId,
    );
    return days.map((day) => ({
      date: day.date,
      free: day.free.map((slot) => slot.toISOString()),
      busy: day.busy.map((slot) => slot.toISOString()),
    }));
  }
}
