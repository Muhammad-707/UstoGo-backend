import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorType, BookingStatus } from '@prisma/client';

import { TransactionManager } from '@prisma-lib/transaction.manager';

import { appendBookingHistory } from './booking-history.util';
import { BOOKING_DETAIL_INCLUDE, type BookingDetailRow } from './booking-includes';
import { BookingStateMachine } from '../domain/booking-state-machine';
import { BOOKING_EVENT, BookingCancelledEvent } from '../events/booking.events';
import { BookingNotFoundException } from '../exceptions/bookings.exceptions';

/** `POST /admin/bookings/:id/cancel` (FR-7.3) — split from `BookingTransitionService` to keep both files under CLAUDE.md's 300-line cap. */
@Injectable()
export class AdminBookingTransitionService {
  private readonly stateMachine = new BookingStateMachine();

  constructor(
    private readonly transactionManager: TransactionManager,
    private readonly events: EventEmitter2,
  ) {}

  async cancel(bookingId: string, reason: string): Promise<BookingDetailRow> {
    const booking = await this.transactionManager.run(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id: bookingId } });
      if (existing === null) {
        throw new BookingNotFoundException();
      }

      this.stateMachine.assertCanTransition(
        existing,
        BookingStatus.CANCELLED_BY_ADMIN,
        ActorType.ADMIN,
      );

      const updated = await tx.booking.update({
        where: { id: existing.id },
        data: {
          status: BookingStatus.CANCELLED_BY_ADMIN,
          cancelledAt: new Date(),
          cancelledByType: ActorType.ADMIN,
          cancellationReason: reason,
        },
        include: BOOKING_DETAIL_INCLUDE,
      });

      await appendBookingHistory({
        tx,
        bookingId: existing.id,
        fromStatus: existing.status,
        toStatus: BookingStatus.CANCELLED_BY_ADMIN,
        actorType: ActorType.ADMIN,
        reason,
      });

      return updated;
    });

    this.events.emit(
      BOOKING_EVENT.CANCELLED,
      new BookingCancelledEvent(booking.id, booking.clientProfile.user.id, ActorType.ADMIN, reason),
    );
    this.events.emit(
      BOOKING_EVENT.CANCELLED,
      new BookingCancelledEvent(booking.id, booking.masterProfile.user.id, ActorType.ADMIN, reason),
    );

    return booking;
  }
}
