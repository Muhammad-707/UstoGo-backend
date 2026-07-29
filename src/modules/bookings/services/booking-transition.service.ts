import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorType, BookingStatus, Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import { appendBookingHistory } from './booking-history.util';
import { BOOKING_DETAIL_INCLUDE, type BookingDetailRow } from './booking-includes';
import { clientProfileIdFor, masterProfileIdFor } from './profile-lookup.util';
import {
  EARLY_START_WINDOW_MINUTES,
  LATE_CANCELLATION_WINDOW_MINUTES,
} from '../constants/booking.constants';
import { BookingStateMachine } from '../domain/booking-state-machine';
import {
  BOOKING_EVENT,
  BookingAcceptedEvent,
  BookingCancelledEvent,
  BookingCompletedEvent,
  BookingRejectedEvent,
  BookingStartedEvent,
} from '../events/booking.events';
import {
  BookingNotFoundException,
  BookingOverlapException,
  ReasonRequiredException,
  TooEarlyToStartException,
} from '../exceptions/bookings.exceptions';

const ACTIVE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.IN_PROGRESS,
];

/**
 * F-09 transitions (MODULES.md › BookingsModule). Every mutation appends an immutable
 * `BookingStatusHistory` row in the same transaction, and emits its domain event only
 * after that transaction commits (CLAUDE.md §9): a notification for a rolled-back
 * transition is worse than none.
 */
@Injectable()
export class BookingTransitionService {
  private readonly stateMachine = new BookingStateMachine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * FR-7.2 — the only transition run at `SERIALIZABLE`, with an explicit overlap
   * re-check in addition. The GiST exclusion constraint (DATABASE.md §7.1) is the
   * backstop if two masters — or the same master — race to accept overlapping slots;
   * it surfaces here as a raw Postgres error the global filter maps to `409
   * BOOKING_OVERLAP` (`prisma-exception.mapper.ts`), so this method does not catch it.
   */
  async accept(masterUserId: string, bookingId: string): Promise<BookingDetailRow> {
    const masterProfileId = await masterProfileIdFor(this.prisma, masterUserId);

    const booking = await this.transactionManager.run(
      async (tx) => {
        const existing = await tx.booking.findUnique({ where: { id: bookingId } });
        this.assertOwnedByMaster(existing, masterProfileId);

        this.stateMachine.assertCanTransition(existing, BookingStatus.ACCEPTED, ActorType.MASTER);

        const overlap = await tx.booking.findFirst({
          where: {
            masterProfileId,
            id: { not: existing.id },
            status: { in: [...ACTIVE_STATUSES] },
            scheduledAt: { lt: existing.endsAt },
            endsAt: { gt: existing.scheduledAt },
          },
          select: { id: true },
        });
        if (overlap !== null) {
          throw new BookingOverlapException();
        }

        const updated = await tx.booking.update({
          where: { id: existing.id },
          data: { status: BookingStatus.ACCEPTED, acceptedAt: new Date() },
          include: BOOKING_DETAIL_INCLUDE,
        });

        await appendBookingHistory({
          tx,
          bookingId: existing.id,
          fromStatus: existing.status,
          toStatus: BookingStatus.ACCEPTED,
          actorType: ActorType.MASTER,
          actorUserId: masterUserId,
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.events.emit(
      BOOKING_EVENT.ACCEPTED,
      new BookingAcceptedEvent(
        booking.id,
        booking.clientProfile.user.id,
        booking.masterProfile.displayName,
        booking.scheduledAt,
      ),
    );

    return booking;
  }

  /** FR-7.3 — master only, `PENDING` only, reason mandatory (enforced by `RejectBookingDto`). */
  async reject(masterUserId: string, bookingId: string, reason: string): Promise<BookingDetailRow> {
    const masterProfileId = await masterProfileIdFor(this.prisma, masterUserId);

    const booking = await this.transactionManager.run(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id: bookingId } });
      this.assertOwnedByMaster(existing, masterProfileId);

      this.stateMachine.assertCanTransition(existing, BookingStatus.REJECTED, ActorType.MASTER);

      const updated = await tx.booking.update({
        where: { id: existing.id },
        data: { status: BookingStatus.REJECTED, cancellationReason: reason },
        include: BOOKING_DETAIL_INCLUDE,
      });

      await appendBookingHistory({
        tx,
        bookingId: existing.id,
        fromStatus: existing.status,
        toStatus: BookingStatus.REJECTED,
        actorType: ActorType.MASTER,
        actorUserId: masterUserId,
        reason,
      });

      return updated;
    });

    this.events.emit(
      BOOKING_EVENT.REJECTED,
      new BookingRejectedEvent(
        booking.id,
        booking.clientProfile.user.id,
        booking.masterProfile.displayName,
        reason,
      ),
    );

    return booking;
  }

  /** FR-7.3 — client or master; reason mandatory for the master. */
  async cancel(
    caller: { userId: string; role: UserRole },
    bookingId: string,
    reason: string | undefined,
  ): Promise<BookingDetailRow> {
    const actorType = caller.role === UserRole.CLIENT ? ActorType.CLIENT : ActorType.MASTER;
    const targetStatus =
      actorType === ActorType.CLIENT
        ? BookingStatus.CANCELLED_BY_CLIENT
        : BookingStatus.CANCELLED_BY_MASTER;
    if (actorType === ActorType.MASTER && (reason === undefined || reason.length === 0)) {
      throw new ReasonRequiredException();
    }

    const booking = await this.transactionManager.run(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id: bookingId } });
      if (existing === null) {
        throw new BookingNotFoundException();
      }

      await this.assertOwnsBooking(existing, caller.userId, actorType);
      this.stateMachine.assertCanTransition(existing, targetStatus, actorType);

      const updated = await tx.booking.update({
        where: { id: existing.id },
        data: {
          status: targetStatus,
          cancelledAt: new Date(),
          cancelledByType: actorType,
          isLateCancellation: this.isLateCancellation(existing),
          ...(reason !== undefined ? { cancellationReason: reason } : {}),
        },
        include: BOOKING_DETAIL_INCLUDE,
      });

      await appendBookingHistory({
        tx,
        bookingId: existing.id,
        fromStatus: existing.status,
        toStatus: targetStatus,
        actorType,
        actorUserId: caller.userId,
        ...(reason !== undefined ? { reason } : {}),
      });

      return updated;
    });

    this.emitCancelled(booking, actorType, reason ?? null);

    return booking;
  }

  private isLateCancellation(existing: { status: BookingStatus; scheduledAt: Date }): boolean {
    return (
      existing.status === BookingStatus.ACCEPTED &&
      existing.scheduledAt.getTime() - Date.now() <= LATE_CANCELLATION_WINDOW_MINUTES * 60_000
    );
  }

  private emitCancelled(
    booking: BookingDetailRow,
    actorType: ActorType,
    reason: string | null,
  ): void {
    const notifyUserId =
      actorType === ActorType.CLIENT
        ? booking.masterProfile.user.id
        : booking.clientProfile.user.id;

    this.events.emit(
      BOOKING_EVENT.CANCELLED,
      new BookingCancelledEvent(booking.id, notifyUserId, actorType, reason),
    );
  }

  /** FR-7.4 — master only, `ACCEPTED` only, not earlier than 30 minutes before the slot. */
  async start(masterUserId: string, bookingId: string): Promise<BookingDetailRow> {
    const masterProfileId = await masterProfileIdFor(this.prisma, masterUserId);

    const booking = await this.transactionManager.run(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id: bookingId } });
      this.assertOwnedByMaster(existing, masterProfileId);

      this.stateMachine.assertCanTransition(existing, BookingStatus.IN_PROGRESS, ActorType.MASTER);

      const earliestStart = existing.scheduledAt.getTime() - EARLY_START_WINDOW_MINUTES * 60_000;
      if (Date.now() < earliestStart) {
        throw new TooEarlyToStartException();
      }

      const updated = await tx.booking.update({
        where: { id: existing.id },
        data: { status: BookingStatus.IN_PROGRESS, startedAt: new Date() },
        include: BOOKING_DETAIL_INCLUDE,
      });

      await appendBookingHistory({
        tx,
        bookingId: existing.id,
        fromStatus: existing.status,
        toStatus: BookingStatus.IN_PROGRESS,
        actorType: ActorType.MASTER,
        actorUserId: masterUserId,
      });

      return updated;
    });

    this.events.emit(
      BOOKING_EVENT.STARTED,
      new BookingStartedEvent(
        booking.id,
        booking.clientProfile.user.id,
        booking.masterProfile.displayName,
      ),
    );

    return booking;
  }

  /**
   * FR-7.4 — master only, `IN_PROGRESS` only. `completedBookingsCount` is a denormalised
   * aggregate written only inside this transaction (DATABASE.md §3.3's contract).
   */
  async complete(masterUserId: string, bookingId: string): Promise<BookingDetailRow> {
    const masterProfileId = await masterProfileIdFor(this.prisma, masterUserId);

    const booking = await this.transactionManager.run(async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id: bookingId } });
      this.assertOwnedByMaster(existing, masterProfileId);

      this.stateMachine.assertCanTransition(existing, BookingStatus.COMPLETED, ActorType.MASTER);

      const updated = await tx.booking.update({
        where: { id: existing.id },
        data: { status: BookingStatus.COMPLETED, completedAt: new Date() },
        include: BOOKING_DETAIL_INCLUDE,
      });

      await tx.masterProfile.update({
        where: { id: masterProfileId },
        data: { completedBookingsCount: { increment: 1 } },
      });

      await appendBookingHistory({
        tx,
        bookingId: existing.id,
        fromStatus: existing.status,
        toStatus: BookingStatus.COMPLETED,
        actorType: ActorType.MASTER,
        actorUserId: masterUserId,
      });

      return updated;
    });

    this.events.emit(
      BOOKING_EVENT.COMPLETED,
      new BookingCompletedEvent(
        booking.id,
        booking.clientProfile.user.id,
        booking.masterProfile.displayName,
      ),
    );

    return booking;
  }

  private assertOwnedByMaster<T extends { masterProfileId: string } | null>(
    booking: T,
    masterProfileId: string,
  ): asserts booking is NonNullable<T> {
    if (booking === null || booking.masterProfileId !== masterProfileId) {
      throw new BookingNotFoundException();
    }
  }

  /** Client/master ownership check for `cancel` — 404, never 403 (AUTHORIZATION.md §1). */
  private async assertOwnsBooking(
    booking: { clientProfileId: string; masterProfileId: string },
    userId: string,
    actorType: ActorType,
  ): Promise<void> {
    const ownerId =
      actorType === ActorType.CLIENT
        ? await clientProfileIdFor(this.prisma, userId)
        : await masterProfileIdFor(this.prisma, userId);
    const owns =
      actorType === ActorType.CLIENT
        ? booking.clientProfileId === ownerId
        : booking.masterProfileId === ownerId;

    if (!owns) {
      throw new BookingNotFoundException();
    }
  }
}
