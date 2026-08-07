import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ConflictException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import { type BookingDetailRow } from './booking-includes';
import { BookingsService } from './bookings.service';
import { isPaymentNoteRequired } from '../domain/payment-confirmation.util';
import type { ConfirmBookingPaymentDto } from '../dto/requests/confirm-booking-payment.dto';
import { BOOKING_EVENT, BookingPaymentConfirmedEvent } from '../events/booking.events';
import {
  BookingNotFoundException,
  PaymentAlreadyConfirmedException,
  PaymentNoteRequiredException,
} from '../exceptions/bookings.exceptions';

/**
 * Client-recorded confirmation of what was actually paid, off-platform (ADR-8 —
 * payments are not processed in-platform; this records the outcome of a cash/bank
 * transfer that already happened, the same way `Review` records satisfaction). Split
 * out of `BookingsService`/`BookingTransitionService` since this is not itself a
 * status transition — `status` stays `COMPLETED` throughout.
 */
@Injectable()
export class BookingPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly events: EventEmitter2,
  ) {}

  async confirm(
    userId: string,
    bookingId: string,
    dto: ConfirmBookingPaymentDto,
  ): Promise<BookingDetailRow> {
    const booking = await this.bookings.findById(bookingId);
    this.assertConfirmable(booking, userId);

    const note = dto.note ?? null;
    if (isPaymentNoteRequired(dto.paidAmount, booking.price.toNumber())) {
      if (note === null) {
        throw new PaymentNoteRequiredException();
      }
    }

    const paymentConfirmedAt = new Date();
    await this.prisma.db.booking.update({
      where: { id: bookingId },
      data: { paidAmount: dto.paidAmount, paymentNote: note, paymentConfirmedAt },
    });

    this.events.emit(
      BOOKING_EVENT.PAYMENT_CONFIRMED,
      new BookingPaymentConfirmedEvent(
        booking.id,
        booking.masterProfile.user.id,
        dto.paidAmount.toFixed(2),
        booking.price.toFixed(2),
        booking.currency,
        note,
      ),
    );

    return this.bookings.findById(bookingId);
  }

  /** Client-owner only (404, never 403), COMPLETED only, once. */
  private assertConfirmable(booking: BookingDetailRow, userId: string): void {
    if (booking.clientProfile.user.id !== userId) {
      throw new BookingNotFoundException();
    }
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new ConflictException(
        ERROR_CODE.BOOKING_NOT_COMPLETED,
        'Only a completed booking’s payment can be confirmed.',
      );
    }
    if (booking.paymentConfirmedAt !== null) {
      throw new PaymentAlreadyConfirmedException();
    }
  }
}
