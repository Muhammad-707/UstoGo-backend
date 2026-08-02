import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
import { MastersSearchService } from '@modules/masters/services/masters-search.service';

import { WorkingDayResponseDto } from '../dto/responses/working-day.response.dto';

/**
 * Public `GET /masters/:id/schedule`.
 *
 * Lives here — NOT in `MastersController` — so that `ScheduleMeController`'s
 * `masters/me/schedule` routes are registered first (Express first-match-wins);
 * otherwise `/masters/me/schedule` would be caught by `:id/schedule` with
 * `id = "me"` and die on the UUID cast. `ScheduleModule` is imported before
 * `MastersModule` in `AppModule` for the same reason.
 */
@ApiTags('Masters')
@Controller('masters/:id/schedule')
export class PublicScheduleController {
  constructor(private readonly search: MastersSearchService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'A master’s weekly working hours' })
  @ApiOkResponse({ type: WorkingDayResponseDto, isArray: true })
  async get(@Param('id') id: string): Promise<WorkingDayResponseDto[]> {
    const days = await this.search.getPublicSchedule(id);
    return days.map((day) => WorkingDayResponseDto.fromEntity(day));
  }
}
