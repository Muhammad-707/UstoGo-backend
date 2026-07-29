import { Module } from '@nestjs/common';

import { ScheduleModule } from '@modules/schedule/schedule.module';

import { AdminBookingsController } from './controllers/admin-bookings.controller';
import { BookingsController } from './controllers/bookings.controller';
import { AdminBookingTransitionService } from './services/admin-booking-transition.service';
import { BookingJobsService } from './services/booking-jobs.service';
import { BookingTransitionService } from './services/booking-transition.service';
import { BookingsService } from './services/bookings.service';

/** F-09 (MODULES.md › BookingsModule). */
@Module({
  imports: [ScheduleModule],
  controllers: [BookingsController, AdminBookingsController],
  providers: [
    BookingsService,
    BookingTransitionService,
    AdminBookingTransitionService,
    BookingJobsService,
  ],
  exports: [
    BookingsService,
    BookingTransitionService,
    AdminBookingTransitionService,
    BookingJobsService,
  ],
})
export class BookingsModule {}
