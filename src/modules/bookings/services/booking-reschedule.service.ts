import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus, Prisma } from '@prisma/client';

import { zonedDateOf } from '@modules/schedule/domain/zoned-time';
import { AvailabilityService } from '@modules/schedule/services/availability.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import { BOOKING_DETAIL_INCLUDE, type BookingDetailRow } from './booking-includes';
import { BookingsService } from './bookings.service';
import {
  MAX_RESCHEDULE_COUNT,
  MIN_LEAD_MINUTES,
  RESCHEDULE_WINDOW_HOURS,
} from '../constants/booking.constants';
import type { RescheduleBookingDto } from '../dto/requests/reschedule-booking.dto';
import { BOOKING_EVENT, BookingRescheduledEvent } from '../events/booking.events';
import {
  BookingNotFoundException,
  BookingOverlapException,
  ClientSlotConflictException,
  IllegalBookingTransitionException,
  RescheduleLimitExceededException,
  RescheduleWindowClosedException,
  SlotNotAvailableException,
  SlotTooSoonException,
} from '../exceptions/bookings.exceptions';

/** B-51: a reschedule changes `scheduledAt`/`endsAt` only — status is untouched. */
const RESCHEDULABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.ACCEPTED,
];

const OPEN_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.ACCEPTED,
];

/** Same set the GiST exclusion constraint (`DATABASE.md` §7.1) guards. */
const MASTER_BUSY_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.IN_PROGRESS,
];

type NewSlot = { scheduledAt: Date; endsAt: Date };

/**
 * B-51 (MODULES.md › BookingsModule). Split out of `BookingsService` to stay under
 * CODING_STANDARDS.md's 300-line file cap. A reschedule shares `create()`'s
 * validation shape (availability, client overlap) but is not itself a status
 * transition, so it does not belong in `BookingTransitionService` either.
 */
@Injectable()
export class BookingRescheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
    private readonly availability: AvailabilityService,
    private readonly bookings: BookingsService,
    private readonly events: EventEmitter2,
  ) {}

  async reschedule(
    userId: string,
    bookingId: string,
    dto: RescheduleBookingDto,
  ): Promise<BookingDetailRow> {
    const booking = await this.bookings.findById(bookingId);
    this.assertReschedulable(booking, userId);

    const slot = await this.validateNewSlot(booking, dto.scheduledAt);
    const updated = await this.applyReschedule(booking, slot);

    this.events.emit(
      BOOKING_EVENT.RESCHEDULED,
      new BookingRescheduledEvent(
        updated.id,
        updated.masterProfile.user.id,
        booking.scheduledAt,
        updated.scheduledAt,
      ),
    );

    return updated;
  }

  /** Client-owner only (404, never 403), PENDING/ACCEPTED only, once, >=24h out. */
  private assertReschedulable(booking: BookingDetailRow, userId: string): void {
    if (booking.clientProfile.user.id !== userId) {
      throw new BookingNotFoundException();
    }
    if (!RESCHEDULABLE_STATUSES.includes(booking.status)) {
      throw new IllegalBookingTransitionException();
    }
    if (booking.rescheduleCount >= MAX_RESCHEDULE_COUNT) {
      throw new RescheduleLimitExceededException();
    }
    if (booking.scheduledAt.getTime() - Date.now() < RESCHEDULE_WINDOW_HOURS * 60 * 60_000) {
      throw new RescheduleWindowClosedException();
    }
  }

  /** Same lead-time/availability/client-overlap rules `BookingsService.create` enforces. */
  private async validateNewSlot(
    booking: BookingDetailRow,
    rawScheduledAt: string,
  ): Promise<NewSlot> {
    const scheduledAt = new Date(rawScheduledAt);
    if (scheduledAt.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) {
      throw new SlotTooSoonException();
    }
    const endsAt = new Date(scheduledAt.getTime() + booking.durationMinutes * 60_000);

    const master = await this.prisma.db.masterProfile.findUniqueOrThrow({
      where: { id: booking.masterProfileId },
      select: { timezone: true },
    });
    const day = zonedDateOf(scheduledAt, master.timezone);
    const slots = await this.availability.compute(
      booking.masterProfileId,
      day,
      day,
      booking.serviceId,
    );
    if (!slots.some((free) => free.getTime() === scheduledAt.getTime())) {
      throw new SlotNotAvailableException();
    }

    await this.assertNoClientConflict(booking, scheduledAt, endsAt);

    return { scheduledAt, endsAt };
  }

  private async assertNoClientConflict(
    booking: BookingDetailRow,
    scheduledAt: Date,
    endsAt: Date,
  ): Promise<void> {
    const conflict = await this.prisma.db.booking.findFirst({
      where: {
        clientProfileId: booking.clientProfileId,
        id: { not: booking.id },
        status: { in: [...OPEN_BOOKING_STATUSES] },
        scheduledAt: { lt: endsAt },
        endsAt: { gt: scheduledAt },
      },
    });
    if (conflict !== null) {
      throw new ClientSlotConflictException();
    }
  }

  /**
   * SERIALIZABLE + an explicit master-overlap re-check, mirroring
   * `BookingTransitionService.accept` — an `ACCEPTED` booking's new time is still
   * subject to the `bookings_no_overlap` exclusion constraint.
   */
  private async applyReschedule(
    booking: BookingDetailRow,
    slot: NewSlot,
  ): Promise<BookingDetailRow> {
    return this.transactionManager.run(
      async (tx) => {
        const overlap = await tx.booking.findFirst({
          where: {
            masterProfileId: booking.masterProfileId,
            id: { not: booking.id },
            status: { in: [...MASTER_BUSY_STATUSES] },
            scheduledAt: { lt: slot.endsAt },
            endsAt: { gt: slot.scheduledAt },
          },
          select: { id: true },
        });
        if (overlap !== null) {
          throw new BookingOverlapException();
        }

        return tx.booking.update({
          where: { id: booking.id },
          data: {
            scheduledAt: slot.scheduledAt,
            endsAt: slot.endsAt,
            rescheduleCount: { increment: 1 },
          },
          include: BOOKING_DETAIL_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
