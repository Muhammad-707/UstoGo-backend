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
import { AvailabilityService } from '../services/availability.service';

@ApiTags('Masters')
@Controller('masters/:id')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('availability')
  @Public()
  @ApiOperation({
    summary: 'Computed free slots for a master',
    description:
      'Public. UTC instants; `[]` (not an error) when there is no availability (FR-6.3).',
  })
  @ApiOkResponse({ type: String, isArray: true })
  @ApiUnprocessableEntityResponse({ description: 'DATE_RANGE_TOO_LARGE', type: ErrorResponseDto })
  async availability(
    @Param('id') id: string,
    @Query() query: AvailabilityQueryDto,
  ): Promise<string[]> {
    const slots = await this.availabilityService.compute(id, query.from, query.to, query.serviceId);
    return slots.map((slot) => slot.toISOString());
  }
}
