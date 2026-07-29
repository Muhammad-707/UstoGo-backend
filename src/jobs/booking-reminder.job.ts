import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import {
  REMINDER_JOB_CRON,
  REMINDER_WINDOW_MINUTES,
} from '@modules/bookings/constants/booking.constants';
import { BookingJobsService } from '@modules/bookings/services/booking-jobs.service';

/**
 * Default job proposed and applied per CLAUDE.md §3 — no FR/SRS document times this
 * one (`booking.constants.ts` explains why). Read-only notification fan-out; safe to
 * leave single-instance for now, same as `JobsModule`'s existing caveat.
 */
@Injectable()
export class BookingReminderJob {
  constructor(private readonly bookingJobs: BookingJobsService) {}

  @Cron(REMINDER_JOB_CRON, { name: 'booking-reminder' })
  async run(): Promise<void> {
    await this.bookingJobs.remindUpcomingBookings(REMINDER_WINDOW_MINUTES);
  }
}
