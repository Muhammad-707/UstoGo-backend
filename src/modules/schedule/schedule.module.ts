import { Module } from '@nestjs/common';

import { MastersModule } from '@modules/masters/masters.module';

import { AvailabilityController } from './controllers/availability.controller';
import { ScheduleMeController } from './controllers/schedule-me.controller';
import { AvailabilityService } from './services/availability.service';
import { ScheduleService } from './services/schedule.service';

/** F-07 (MODULES.md › ScheduleModule). */
@Module({
  imports: [MastersModule],
  controllers: [ScheduleMeController, AvailabilityController],
  providers: [ScheduleService, AvailabilityService],
  exports: [ScheduleService, AvailabilityService],
})
export class ScheduleModule {}
