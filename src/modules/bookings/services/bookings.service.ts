import { Injectable } from '@nestjs/common';
import type { BookingStatusHistory } from '@prisma/client';
import { Prisma, UserRole } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import {
  BOOKING_DETAIL_INCLUDE,
  BOOKING_LIST_INCLUDE,
  type BookingDetailRow,
} from './booking-includes';
import { isBookingParticipant } from './booking-participant.util';
import type { ListBookingsQueryDto } from '../dto/requests/list-bookings-query.dto';
import { BookingNotFoundException } from '../exceptions/bookings.exceptions';

/**
 * F-09 reads (MODULES.md › BookingsModule). Creation (including B-24 instant-book)
 * lives in `BookingCreationService`; transitions in `BookingTransitionService` — this
 * file only reads.
 */
@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<BookingDetailRow> {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id },
      include: BOOKING_DETAIL_INCLUDE,
    });

    if (booking === null) {
      throw new BookingNotFoundException();
    }

    return booking;
  }

  async findHistory(bookingId: string): Promise<BookingStatusHistory[]> {
    return this.prisma.db.bookingStatusHistory.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * P0 — records the client's first click of the master's WhatsApp link. The analytics
   * signal is "did the client actually reach out", so only the first click is kept and
   * repeat clicks are no-ops. Non-participants get 404, never 403 (AUTHORIZATION.md §1).
   */
  async recordWhatsappClick(userId: string, bookingId: string): Promise<BookingDetailRow> {
    const booking = await this.findById(bookingId);

    if (booking.clientProfile.user.id !== userId) {
      throw new BookingNotFoundException();
    }

    if (booking.whatsappLinkClickedAt === null) {
      await this.prisma.db.booking.update({
        where: { id: bookingId },
        data: { whatsappLinkClickedAt: new Date() },
      });
    }

    return this.findById(bookingId);
  }

  /**
   * FR-7.6: participants and admins only — a non-participant gets `404`, never `403`,
   * so a foreign booking id cannot be confirmed to exist (AUTHORIZATION.md §1).
   */
  async getForCaller(
    caller: { id: string; role: UserRole },
    bookingId: string,
  ): Promise<{ booking: BookingDetailRow; history: BookingStatusHistory[] }> {
    const booking = await this.findById(bookingId);

    if (!isBookingParticipant(booking, caller)) {
      throw new BookingNotFoundException();
    }

    const history = await this.findHistory(bookingId);

    return { booking, history };
  }

  async listForClient(
    userId: string,
    query: ListBookingsQueryDto,
  ): Promise<{ items: BookingDetailRow[]; total: number }> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    return this.list({ clientProfileId: clientProfile.id }, query);
  }

  async listForMaster(
    userId: string,
    query: ListBookingsQueryDto,
  ): Promise<{ items: BookingDetailRow[]; total: number }> {
    const masterProfile = await this.prisma.db.masterProfile.findUnique({ where: { userId } });
    if (masterProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master profile not found.');
    }

    return this.list({ masterProfileId: masterProfile.id }, query);
  }

  async listForAdmin(
    query: ListBookingsQueryDto & { masterId?: string; clientId?: string },
  ): Promise<{ items: BookingDetailRow[]; total: number }> {
    return this.list(
      {
        ...(query.masterId !== undefined ? { masterProfileId: query.masterId } : {}),
        ...(query.clientId !== undefined ? { clientProfileId: query.clientId } : {}),
      },
      query,
    );
  }

  private async list(
    scope: { clientProfileId?: string; masterProfileId?: string },
    query: ListBookingsQueryDto,
  ) {
    const where: Prisma.BookingWhereInput = {
      ...scope,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.from !== undefined || query.to !== undefined
        ? {
            scheduledAt: {
              ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
              ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.booking.findMany({
        where,
        include: BOOKING_LIST_INCLUDE,
        orderBy: { scheduledAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.booking.count({ where }),
    ]);

    return { items, total };
  }
}
