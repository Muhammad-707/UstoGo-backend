import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingStatus, Prisma } from '@prisma/client';

import { BOOKING_EVENT, type BookingCompletedEvent } from '@modules/bookings/events/booking.events';
import { PrismaService } from '@prisma-lib/prisma.service';

/** Postgres unique-violation code — the concurrency backstop (schema comment on
 *  `ReferralReward.referredClientProfileId`). */
const UNIQUE_VIOLATION = 'P2002';

/**
 * §6.4 (MASTER_PROMPT.md) — the reward side of a referral. Listens rather than being
 * called, same precedent as `BookingNotificationsListener`: `BookingsModule` never
 * imports this module.
 */
@Injectable()
export class ReferralRewardListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(BOOKING_EVENT.COMPLETED)
  async onBookingCompleted(event: BookingCompletedEvent): Promise<void> {
    const client = await this.prisma.db.clientProfile.findUnique({
      where: { userId: event.clientUserId },
      select: { id: true, referredByClientProfileId: true },
    });
    if (client === null || client.referredByClientProfileId === null) {
      return;
    }

    // "First COMPLETED booking" (§6.4) — this listener runs after the transition that
    // just completed `event.bookingId`, so a count of exactly 1 means this was it.
    const completedCount = await this.prisma.db.booking.count({
      where: { clientProfileId: client.id, status: BookingStatus.COMPLETED },
    });
    if (completedCount !== 1) {
      return;
    }

    try {
      await this.prisma.db.referralReward.create({
        data: {
          referrerClientProfileId: client.referredByClientProfileId,
          referredClientProfileId: client.id,
          triggerBookingId: event.bookingId,
        },
      });
    } catch (error) {
      // Already awarded — a concurrent completion, or a retry of this handler.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        return;
      }
      throw error;
    }
  }
}
