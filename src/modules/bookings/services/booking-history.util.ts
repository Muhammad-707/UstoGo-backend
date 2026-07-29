import type { ActorType, BookingStatus } from '@prisma/client';

import type { PrismaTransaction } from '@prisma-lib/transaction.manager';

/** Shared by every transition service — one place that writes the append-only trail. */
export const appendBookingHistory = async (options: {
  tx: PrismaTransaction;
  bookingId: string;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  actorType: ActorType;
  actorUserId?: string;
  reason?: string;
}): Promise<void> => {
  await options.tx.bookingStatusHistory.create({
    data: {
      bookingId: options.bookingId,
      fromStatus: options.fromStatus,
      toStatus: options.toStatus,
      actorType: options.actorType,
      ...(options.actorUserId !== undefined ? { actorUserId: options.actorUserId } : {}),
      ...(options.reason !== undefined ? { reason: options.reason } : {}),
    },
  });
};
