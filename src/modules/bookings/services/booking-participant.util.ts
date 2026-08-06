import { UserRole } from '@prisma/client';

/**
 * FR-7.6 — shared by `BookingsService.getForCaller` and `BookingAttachmentsService`
 * so both check exactly the same rule without one depending on the other (which
 * would otherwise be a circular DI edge between the two services).
 */
export const isBookingParticipant = (
  booking: { masterProfile: { user: { id: string } }; clientProfile: { user: { id: string } } },
  caller: { id: string; role: UserRole },
): boolean =>
  caller.role === UserRole.ADMIN ||
  booking.masterProfile.user.id === caller.id ||
  booking.clientProfile.user.id === caller.id;
