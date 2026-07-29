import { Module } from '@nestjs/common';

import { BookingReminderJob } from './booking-reminder.job';
import { CleanupUnconfirmedFilesJob } from './cleanup-unconfirmed-files.job';
import { ExpirePendingBookingsJob } from './expire-pending-bookings.job';
import { BookingsModule } from '../modules/bookings/bookings.module';

/**
 * Scheduled work (ARCHITECTURE.md §9).
 *
 * Jobs call the same services HTTP handlers do and hold no business logic of their own.
 * `ExpirePendingBookingsJob` is the first one where a double run would be visible to
 * users, which is why `BookingJobsService.expireDueBookings` locks its batch with
 * `FOR UPDATE SKIP LOCKED` rather than relying on single-instance deployment.
 */
@Module({
  imports: [BookingsModule],
  providers: [CleanupUnconfirmedFilesJob, ExpirePendingBookingsJob, BookingReminderJob],
})
export class JobsModule {}
