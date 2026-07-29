import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { EXPIRY_BATCH_SIZE, EXPIRY_JOB_CRON } from '@modules/bookings/constants/booking.constants';
import { BookingJobsService } from '@modules/bookings/services/booking-jobs.service';

/**
 * FR-7.5. Loops within a single run so a backlog larger than one batch drains
 * immediately rather than waiting for the next 10-minute tick; `expireDueBookings`'s
 * `FOR UPDATE SKIP LOCKED` is what makes this and a concurrent run of the same job safe.
 */
@Injectable()
export class ExpirePendingBookingsJob {
  constructor(private readonly bookingJobs: BookingJobsService) {}

  @Cron(EXPIRY_JOB_CRON, { name: 'expire-pending-bookings' })
  async run(): Promise<void> {
    let expiredInBatch: number;

    do {
      expiredInBatch = await this.bookingJobs.expireDueBookings();
    } while (expiredInBatch === EXPIRY_BATCH_SIZE);
  }
}
