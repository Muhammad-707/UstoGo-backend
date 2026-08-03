import { Prisma } from '@prisma/client';

/** The projection `BookingResponseDto.fromEntity` needs — one place it is built. */
export const BOOKING_DETAIL_INCLUDE = {
  masterProfile: {
    select: {
      displayName: true,
      // P0: the booking page shows the client a ready-made WhatsApp message; the
      // number is only published while the master has it enabled.
      whatsappPhone: true,
      whatsappEnabled: true,
      user: { select: { id: true } },
    },
  },
  clientProfile: {
    select: {
      firstName: true,
      lastName: true,
      user: { select: { id: true, phone: true } },
    },
  },
} satisfies Prisma.BookingInclude;

export const BOOKING_LIST_INCLUDE = BOOKING_DETAIL_INCLUDE;

export type BookingDetailRow = Prisma.BookingGetPayload<{ include: typeof BOOKING_DETAIL_INCLUDE }>;
