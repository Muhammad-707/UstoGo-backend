import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import { MasterStatsResponseDto } from '../dto/responses/master-stats.response.dto';

const CANCELLED_STATUSES: readonly BookingStatus[] = [
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
  BookingStatus.CANCELLED_BY_CLIENT,
  BookingStatus.CANCELLED_BY_MASTER,
  BookingStatus.CANCELLED_BY_ADMIN,
];

const DAILY_EARNINGS_WINDOW_DAYS = 14;

type StatusCountRow = { status: BookingStatus; _count: { _all: number } };

const windowStartDate = (): Date => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (DAILY_EARNINGS_WINDOW_DAYS - 1));
  return start;
};

const buildDailyEarnings = (
  windowStart: Date,
  bookings: { completedAt: Date | null; price: Prisma.Decimal }[],
): { date: string; total: string }[] => {
  const byDate = new Map<string, number>();
  for (const booking of bookings) {
    const dateKey = (booking.completedAt ?? windowStart).toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + Number(booking.price));
  }

  return Array.from({ length: DAILY_EARNINGS_WINDOW_DAYS }, (_, i) => {
    const date = new Date(windowStart);
    date.setUTCDate(date.getUTCDate() + i);
    const dateKey = date.toISOString().slice(0, 10);
    return { date: dateKey, total: (byDate.get(dateKey) ?? 0).toFixed(2) };
  });
};

const countFor = (rows: StatusCountRow[], statuses: readonly BookingStatus[]): number =>
  rows
    .filter((row) => statuses.includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);

const buildEarningsByCategory = (
  bookings: {
    price: Prisma.Decimal;
    service: { categoryId: string; category: { name: string } };
  }[],
): { categoryId: string; categoryName: string; total: string; completedCount: number }[] => {
  const byCategory = new Map<
    string,
    { categoryName: string; total: number; completedCount: number }
  >();
  for (const booking of bookings) {
    const key = booking.service.categoryId;
    const entry = byCategory.get(key) ?? {
      categoryName: booking.service.category.name,
      total: 0,
      completedCount: 0,
    };
    entry.total += Number(booking.price);
    entry.completedCount += 1;
    byCategory.set(key, entry);
  }

  return Array.from(byCategory.entries())
    .map(([categoryId, entry]) => ({
      categoryId,
      categoryName: entry.categoryName,
      total: entry.total.toFixed(2),
      completedCount: entry.completedCount,
    }))
    .sort((a, b) => Number(b.total) - Number(a.total));
};

const buildAvgAcceptLatencyMinutes = (
  bookings: { createdAt: Date; acceptedAt: Date | null }[],
): number | null => {
  const latencies = bookings
    .filter((b): b is { createdAt: Date; acceptedAt: Date } => b.acceptedAt !== null)
    .map((b) => (b.acceptedAt.getTime() - b.createdAt.getTime()) / 60_000);

  if (latencies.length === 0) return null;

  const avg = latencies.reduce((sum, m) => sum + m, 0) / latencies.length;
  return Math.round(avg * 10) / 10;
};

const buildRepeatClientRate = (bookings: { clientProfileId: string }[]): number => {
  const countByClient = new Map<string, number>();
  for (const booking of bookings) {
    countByClient.set(
      booking.clientProfileId,
      (countByClient.get(booking.clientProfileId) ?? 0) + 1,
    );
  }
  if (countByClient.size === 0) return 0;

  const repeatClients = Array.from(countByClient.values()).filter((count) => count > 1).length;
  return Math.round((repeatClients / countByClient.size) * 1000) / 10;
};

type RawStats = Awaited<ReturnType<BookingStatsService['fetchRawStats']>>;

/** F-09 dashboard analytics (`GET /bookings/me/stats`) — split out of `BookingsService` to keep it lean. */
@Injectable()
export class BookingStatsService {
  constructor(private readonly prisma: PrismaService) {}

  private fetchRawStats(masterProfileId: string, windowStart: Date) {
    return Promise.all([
      this.prisma.db.booking.aggregate({
        where: { masterProfileId, status: BookingStatus.COMPLETED },
        _sum: { price: true },
      }),
      this.prisma.db.booking.findMany({
        where: {
          masterProfileId,
          status: BookingStatus.COMPLETED,
          completedAt: { gte: windowStart },
        },
        select: { completedAt: true, price: true },
      }),
      this.prisma.db.booking.groupBy({
        by: ['status'],
        where: { masterProfileId },
        _count: { _all: true },
      }),
      this.prisma.db.booking.findMany({
        where: { masterProfileId, status: BookingStatus.COMPLETED },
        select: {
          price: true,
          clientProfileId: true,
          service: { select: { categoryId: true, category: { select: { name: true } } } },
        },
      }),
      this.prisma.db.booking.findMany({
        where: { masterProfileId, acceptedAt: { not: null } },
        select: { createdAt: true, acceptedAt: true },
      }),
    ]);
  }

  async getMasterStats(userId: string): Promise<MasterStatsResponseDto> {
    const masterProfile = await this.prisma.db.masterProfile.findUnique({ where: { userId } });
    if (masterProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master profile not found.');
    }
    const windowStart = windowStartDate();

    const [
      totalEarnings,
      windowBookings,
      statusCounts,
      completedBookings,
      acceptedBookings,
    ]: RawStats = await this.fetchRawStats(masterProfile.id, windowStart);

    const completedCount = countFor(statusCounts, [BookingStatus.COMPLETED]);
    const cancelledCount = countFor(statusCounts, CANCELLED_STATUSES);
    const resolvedCount = completedCount + cancelledCount;

    const dto = new MasterStatsResponseDto();
    dto.totalEarnings = totalEarnings._sum.price?.toFixed(2) ?? '0.00';
    dto.dailyEarnings = buildDailyEarnings(windowStart, windowBookings);
    dto.pendingCount = countFor(statusCounts, [BookingStatus.PENDING]);
    dto.acceptedCount = countFor(statusCounts, [BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS]);
    dto.completedCount = completedCount;
    dto.cancelledCount = cancelledCount;
    dto.completionRate =
      resolvedCount === 0 ? 0 : Math.round((completedCount / resolvedCount) * 1000) / 10;
    dto.earningsByCategory = buildEarningsByCategory(completedBookings);
    dto.avgAcceptLatencyMinutes = buildAvgAcceptLatencyMinutes(acceptedBookings);
    dto.repeatClientRate = buildRepeatClientRate(completedBookings);
    dto.profileViews = masterProfile.profileViews;

    return dto;
  }
}
