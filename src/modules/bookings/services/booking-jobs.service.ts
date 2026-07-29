import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorType, BookingStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { BOOKING_DETAIL_INCLUDE } from './booking-includes';
import {
  EXPIRY_BATCH_SIZE,
  REMINDER_BATCH_SIZE,
  REMINDER_LEAD_MINUTES,
} from '../constants/booking.constants';
import { BOOKING_EVENT, BookingExpiredEvent, BookingReminderEvent } from '../events/booking.events';

/**
 * FR-7.5 and the (undocumented — see `booking.constants.ts`) reminder job. Both read
 * work that `BookingsController`/`BookingTransitionService` never call directly; kept
 * separate from `BookingsService` so neither file exceeds CLAUDE.md's 300-line cap.
 */
@Injectable()
export class BookingJobsService {
  private readonly logger = new Logger(BookingJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * FR-7.5: `PENDING` bookings whose `scheduledAt` has passed, in batches of 100.
   * `FOR UPDATE SKIP LOCKED` inside the CTE is what makes two concurrent runs (or two
   * instances) safe — each skips rows the other already has locked rather than
   * blocking or double-expiring them. Returns the count actually expired, so the job
   * knows whether to loop for another batch.
   */
  async expireDueBookings(): Promise<number> {
    const expired = await this.prisma.db.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH expiring AS (
        SELECT id FROM bookings
        WHERE status = 'PENDING' AND scheduled_at < now() AND deleted_at IS NULL
        ORDER BY scheduled_at
        LIMIT ${EXPIRY_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE bookings b
      SET status = 'EXPIRED', updated_at = now()
      FROM expiring e
      WHERE b.id = e.id
      RETURNING b.id
    `);

    if (expired.length === 0) {
      return 0;
    }

    const ids = expired.map((row) => row.id);

    await this.prisma.db.bookingStatusHistory.createMany({
      data: ids.map((id) => ({
        bookingId: id,
        fromStatus: BookingStatus.PENDING,
        toStatus: BookingStatus.EXPIRED,
        actorType: ActorType.SYSTEM,
      })),
    });

    const bookings = await this.prisma.db.booking.findMany({
      where: { id: { in: ids } },
      include: BOOKING_DETAIL_INCLUDE,
    });

    for (const booking of bookings) {
      this.events.emit(
        BOOKING_EVENT.EXPIRED,
        new BookingExpiredEvent(
          booking.id,
          booking.clientProfile.user.id,
          booking.masterProfile.user.id,
        ),
      );
    }

    this.logger.log(`Expired ${String(ids.length)} pending booking(s)`);

    return ids.length;
  }

  /**
   * Default chosen per CLAUDE.md §3 (no FR/SRS specifies this job — see
   * `booking.constants.ts`): reminds both parties once, `REMINDER_LEAD_MINUTES` before
   * an `ACCEPTED`/`IN_PROGRESS` booking's `scheduledAt`. Read-only and idempotent
   * *enough*: the query window is exactly the job's own cron interval, so a booking
   * falls into it on only one run as long as the job keeps its cadence — the same
   * "single instance for now" caveat `JobsModule` already documents for jobs that
   * don't yet need cross-instance coordination.
   */
  async remindUpcomingBookings(windowMinutes: number): Promise<number> {
    const now = Date.now();
    const windowStart = new Date(now + REMINDER_LEAD_MINUTES * 60_000);
    const windowEnd = new Date(now + (REMINDER_LEAD_MINUTES + windowMinutes) * 60_000);

    const bookings = await this.prisma.db.booking.findMany({
      where: {
        status: { in: [BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS] },
        scheduledAt: { gte: windowStart, lt: windowEnd },
        deletedAt: null,
      },
      include: BOOKING_DETAIL_INCLUDE,
      take: REMINDER_BATCH_SIZE,
    });

    if (bookings.length === 0) {
      return 0;
    }

    for (const booking of bookings) {
      this.events.emit(
        BOOKING_EVENT.REMINDER,
        new BookingReminderEvent(booking.id, booking.clientProfile.user.id, booking.scheduledAt),
      );
      this.events.emit(
        BOOKING_EVENT.REMINDER,
        new BookingReminderEvent(booking.id, booking.masterProfile.user.id, booking.scheduledAt),
      );
    }

    this.logger.log(`Reminded ${String(bookings.length)} upcoming booking(s)`);

    return bookings.length;
  }
}
