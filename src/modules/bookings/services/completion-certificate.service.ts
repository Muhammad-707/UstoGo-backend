import { Injectable } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { isBookingParticipant } from './booking-participant.util';
import type { CompletionCertificateResponseDto } from '../dto/responses/completion-certificate.response.dto';
import {
  BookingNotFoundException,
  CompletionCertificateNotFoundException,
} from '../exceptions/bookings.exceptions';

const CERTIFICATE_BOOKING_INCLUDE = {
  masterProfile: { select: { displayName: true, user: { select: { id: true } } } },
  clientProfile: { select: { firstName: true, lastName: true, user: { select: { id: true } } } },
} as const;

/**
 * Read access to the `CompletionCertificate` `BookingTransitionService.complete`
 * issues automatically. Issuance lives there (same transaction as the COMPLETED
 * write); this service only ever reads.
 */
@Injectable()
export class CompletionCertificateService {
  constructor(private readonly prisma: PrismaService) {}

  /** For the booking's own participants — 404, never 403, for a non-participant. */
  async getForBooking(
    caller: { id: string; role: UserRole },
    bookingId: string,
  ): Promise<CompletionCertificateResponseDto> {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id: bookingId },
      include: { ...CERTIFICATE_BOOKING_INCLUDE, certificate: true },
    });
    if (booking === null || !isBookingParticipant(booking, caller)) {
      throw new BookingNotFoundException();
    }
    if (booking.certificate === null) {
      throw new CompletionCertificateNotFoundException();
    }

    return this.toDto(booking, booking.certificate);
  }

  /** Public — anyone holding the code (e.g. from a scanned QR) can verify it. */
  async verify(code: string): Promise<CompletionCertificateResponseDto> {
    const certificate = await this.prisma.db.completionCertificate.findUnique({
      where: { verificationCode: code },
      include: { booking: { include: CERTIFICATE_BOOKING_INCLUDE } },
    });
    if (certificate === null) {
      throw new CompletionCertificateNotFoundException();
    }

    return this.toDto(certificate.booking, certificate);
  }

  private toDto(
    booking: {
      bookingNumber: string;
      serviceTitle: string;
      completedAt: Date | null;
      masterProfile: { displayName: string };
      clientProfile: { firstName: string; lastName: string };
    },
    certificate: { verificationCode: string; issuedAt: Date },
  ): CompletionCertificateResponseDto {
    return {
      verificationCode: certificate.verificationCode,
      verifyPath: `/api/v1/certificates/verify/${certificate.verificationCode}`,
      issuedAt: certificate.issuedAt.toISOString(),
      bookingNumber: booking.bookingNumber,
      serviceTitle: booking.serviceTitle,
      masterDisplayName: booking.masterProfile.displayName,
      clientName: `${booking.clientProfile.firstName} ${booking.clientProfile.lastName}`,
      completedAt: booking.completedAt?.toISOString() ?? '',
    };
  }
}
