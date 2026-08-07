import { BookingStatus } from '@prisma/client';

import { LATE_CANCELLATION_WINDOW_MINUTES } from '../constants/booking.constants';

/** True once an `ACCEPTED` booking's slot is within the late-cancellation window. */
export const isLateCancellation = (existing: {
  status: BookingStatus;
  scheduledAt: Date;
}): boolean =>
  existing.status === BookingStatus.ACCEPTED &&
  existing.scheduledAt.getTime() - Date.now() <= LATE_CANCELLATION_WINDOW_MINUTES * 60_000;
