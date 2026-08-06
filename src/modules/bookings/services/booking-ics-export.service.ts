import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { masterProfileIdFor } from './profile-lookup.util';
import { buildIcsCalendar, type IcsEvent } from '../domain/ics-export.util';

/** Bounds the query — a calendar feed is "what's coming up", not the full history. */
const EXPORT_WINDOW_DAYS = 180;
const EXPORT_MAX_EVENTS = 500;

const EXPORT_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.IN_PROGRESS,
];

/**
 * iCal export of a master's own upcoming work schedule (F-09 adjacent,
 * MODULES.md › BookingsModule). Split out of `BookingsService` — a distinct
 * concern (text generation, not booking CRUD) with its own file per
 * CODING_STANDARDS.md's 300-line cap.
 */
@Injectable()
export class BookingIcsExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportMasterSchedule(userId: string): Promise<string> {
    const masterProfileId = await masterProfileIdFor(this.prisma, userId);
    const now = new Date();
    const until = new Date(now.getTime() + EXPORT_WINDOW_DAYS * 24 * 60 * 60_000);

    const bookings = await this.prisma.db.booking.findMany({
      where: {
        masterProfileId,
        status: { in: [...EXPORT_STATUSES] },
        scheduledAt: { gte: now, lte: until },
      },
      select: {
        id: true,
        bookingNumber: true,
        serviceTitle: true,
        scheduledAt: true,
        endsAt: true,
        addressLine: true,
        addressDistrict: true,
        clientProfile: { select: { firstName: true, lastName: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: EXPORT_MAX_EVENTS,
    });

    const events: IcsEvent[] = bookings.map((booking) => ({
      uid: booking.id,
      start: booking.scheduledAt,
      end: booking.endsAt,
      summary: `${booking.serviceTitle} — ${booking.clientProfile.firstName} ${booking.clientProfile.lastName}`,
      description: `Booking ${booking.bookingNumber}`,
      location: `${booking.addressLine}, ${booking.addressDistrict}`,
    }));

    return buildIcsCalendar(events);
  }
}
