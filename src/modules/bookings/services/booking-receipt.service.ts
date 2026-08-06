import { Injectable } from '@nestjs/common';
import { BookingStatus, type UserRole } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ConflictException } from '@common/exceptions/generic.exceptions';

import { BookingsService } from './bookings.service';
import { buildReceiptPdf } from '../domain/pdf-export.util';

/**
 * A downloadable PDF receipt for a completed booking. Split out of `BookingsService`
 * to stay under the 300-line file cap; depends on it one-directionally for
 * `getForCaller`'s participant check (client/master/admin, 404 otherwise).
 */
@Injectable()
export class BookingReceiptService {
  constructor(private readonly bookings: BookingsService) {}

  async generate(caller: { id: string; role: UserRole }, bookingId: string): Promise<Buffer> {
    const { booking } = await this.bookings.getForCaller(caller, bookingId);

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new ConflictException(
        ERROR_CODE.BOOKING_NOT_COMPLETED,
        'Only a completed booking has a receipt.',
      );
    }

    return buildReceiptPdf([
      'UstoGo -- Booking Receipt',
      '',
      `Booking: ${booking.bookingNumber}`,
      `Service: ${booking.serviceTitle}`,
      `Master: ${booking.masterProfile.displayName}`,
      `Client: ${booking.clientProfile.firstName} ${booking.clientProfile.lastName}`,
      `Completed: ${booking.completedAt?.toISOString().slice(0, 10) ?? ''}`,
      `Price: ${booking.price.toFixed(2)} ${booking.currency}`,
      `Address: ${booking.addressLine}, ${booking.addressDistrict}`,
    ]);
  }
}
