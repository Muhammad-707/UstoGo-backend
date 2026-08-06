import { Injectable } from '@nestjs/common';
import { BookingStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { masterProfileIdFor } from './profile-lookup.util';
import {
  optimizeRoute,
  routeDistanceKm,
  type OptimizableStop,
} from '../domain/schedule-optimizer.util';
import type {
  OptimizedStopDto,
  ScheduleOptimizerResponseDto,
} from '../dto/responses/schedule-optimizer.response.dto';

const ROUTABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.IN_PROGRESS,
];

const DAY_ROW_SELECT = {
  id: true,
  bookingNumber: true,
  serviceTitle: true,
  scheduledAt: true,
  addressDistrict: true,
  latitude: true,
  longitude: true,
} satisfies Prisma.BookingSelect;

type DayRow = Prisma.BookingGetPayload<{ select: typeof DAY_ROW_SELECT }>;

/**
 * Suggests a visiting order for a master's same-day jobs that minimises travel
 * distance (nearest-neighbor heuristic, `domain/schedule-optimizer.util.ts`).
 * Read-only — it never reschedules anything, only reorders how the master reads
 * their own day.
 */
@Injectable()
export class ScheduleOptimizerService {
  constructor(private readonly prisma: PrismaService) {}

  async optimizeDay(userId: string, date: string): Promise<ScheduleOptimizerResponseDto> {
    const masterProfileId = await masterProfileIdFor(this.prisma, userId);
    const bookings = await this.dayBookings(masterProfileId, date);
    const byId = new Map(bookings.map((booking) => [booking.id, booking]));

    const stops: OptimizableStop[] = bookings.map((booking) => ({
      bookingId: booking.id,
      scheduledAt: booking.scheduledAt,
      latitude: booking.latitude?.toNumber() ?? null,
      longitude: booking.longitude?.toNumber() ?? null,
    }));

    const chronologicalDistanceKm = routeDistanceKm(stops);
    const optimized = optimizeRoute(stops);
    const totalDistanceKm = routeDistanceKm(optimized);

    return {
      date,
      totalDistanceKm,
      chronologicalDistanceKm,
      estimatedSavingsKm: Math.max(
        0,
        Math.round((chronologicalDistanceKm - totalDistanceKm) * 10) / 10,
      ),
      stops: this.formatStops(optimized, byId),
    };
  }

  private async dayBookings(masterProfileId: string, date: string): Promise<DayRow[]> {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    return this.prisma.db.booking.findMany({
      where: {
        masterProfileId,
        status: { in: [...ROUTABLE_STATUSES] },
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      select: DAY_ROW_SELECT,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  private formatStops(
    optimized: readonly OptimizableStop[],
    byId: Map<string, DayRow>,
  ): OptimizedStopDto[] {
    return optimized.map((stop, index) => {
      const booking = byId.get(stop.bookingId);
      return {
        order: index + 1,
        bookingId: stop.bookingId,
        bookingNumber: booking?.bookingNumber ?? '',
        serviceTitle: booking?.serviceTitle ?? '',
        scheduledAt: stop.scheduledAt.toISOString(),
        district: booking?.addressDistrict ?? '',
      };
    });
  }
}
