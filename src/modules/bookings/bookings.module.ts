import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';
import { ScheduleModule } from '@modules/schedule/schedule.module';

import { AdminBookingsController } from './controllers/admin-bookings.controller';
import { BookingsController } from './controllers/bookings.controller';
import { BookingsGateway } from './gateway/bookings.gateway';
import { AdminBookingTransitionService } from './services/admin-booking-transition.service';
import { BookingJobsService } from './services/booking-jobs.service';
import { BookingRescheduleService } from './services/booking-reschedule.service';
import { BookingStatsService } from './services/booking-stats.service';
import { BookingTransitionService } from './services/booking-transition.service';
import { BookingsService } from './services/bookings.service';

/**
 * F-09 (MODULES.md › BookingsModule). Imports `AuthModule` only for the JWT
 * verification `BookingsGateway` reuses for its socket handshake, the same reason
 * `ChatModule` imports it for `ChatGateway`.
 */
@Module({
  imports: [ScheduleModule, AuthModule],
  controllers: [BookingsController, AdminBookingsController],
  providers: [
    BookingsService,
    BookingTransitionService,
    BookingRescheduleService,
    AdminBookingTransitionService,
    BookingJobsService,
    BookingStatsService,
    BookingsGateway,
  ],
  exports: [
    BookingsService,
    BookingTransitionService,
    BookingRescheduleService,
    AdminBookingTransitionService,
    BookingJobsService,
    BookingStatsService,
  ],
})
export class BookingsModule {}
