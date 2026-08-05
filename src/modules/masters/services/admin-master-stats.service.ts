import { Injectable } from '@nestjs/common';
import { BookingStatus, ReviewStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { computeNps } from '../../reviews/domain/nps.util';
import type {
  AdminMasterStatsResponseDto,
  MasterStatsMonthPointDto,
  MasterStatsTopServiceDto,
} from '../dto/responses/admin-master-stats.response.dto';
import { MasterNotFoundException } from '../exceptions/masters.exceptions';

const UNFINISHED_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.ACCEPTED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
  BookingStatus.CANCELLED_BY_CLIENT,
  BookingStatus.CANCELLED_BY_MASTER,
  BookingStatus.CANCELLED_BY_ADMIN,
];

const MONTHLY_SERIES_MONTHS = 6;
const TOP_SERVICES_LIMIT = 5;

type MonthlySeriesRow = {
  month: Date;
  bookings: bigint;
  completed: bigint;
  revenue: string | null;
};

const monthKey = (date: Date): string => date.toISOString().slice(0, 7);

/**
 * `GET /admin/masters/:id/stats` (MASTER_PROMPT.md §5.2). Split out of
 * `MastersService` — a distinct read-only reporting surface with no business rule to
 * delegate to, same reasoning `DashboardService` (F-15) already applied to the
 * platform-wide equivalent.
 */
@Injectable()
export class AdminMasterStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(masterId: string): Promise<AdminMasterStatsResponseDto> {
    const master = await this.prisma.db.masterProfile.findUnique({ where: { id: masterId } });
    if (master === null) {
      throw new MasterNotFoundException();
    }

    const [
      totalClientsServed,
      completedJobs,
      unfinishedJobs,
      npsScores,
      reviewsBreakdown,
      monthlySeries,
      topServices,
    ] = await Promise.all([
      this.countDistinctClients(masterId),
      this.prisma.db.booking.count({
        where: { masterProfileId: masterId, status: BookingStatus.COMPLETED },
      }),
      this.prisma.db.booking.count({
        where: { masterProfileId: masterId, status: { in: [...UNFINISHED_STATUSES] } },
      }),
      this.fetchNpsScores(masterId),
      this.reviewsBreakdown(masterId),
      this.monthlySeries(masterId),
      this.topServices(masterId),
    ]);

    const { nps, responseCount } = computeNps(npsScores);

    return {
      masterId,
      totalClientsServed,
      completedJobs,
      unfinishedJobs,
      avgRating: Number(master.ratingAverage),
      ratingCount: master.ratingCount,
      nps,
      npsResponseCount: responseCount,
      reviewsBreakdown,
      monthlySeries,
      topServices,
    };
  }

  private async countDistinctClients(masterId: string): Promise<number> {
    const rows = await this.prisma.db.booking.findMany({
      where: { masterProfileId: masterId, status: BookingStatus.COMPLETED },
      select: { clientProfileId: true },
      distinct: ['clientProfileId'],
    });
    return rows.length;
  }

  private async fetchNpsScores(masterId: string): Promise<number[]> {
    const rows = await this.prisma.db.review.findMany({
      where: { masterProfileId: masterId, status: ReviewStatus.VISIBLE, npsScore: { not: null } },
      select: { npsScore: true },
    });
    return rows.map((row) => row.npsScore as number);
  }

  private async reviewsBreakdown(
    masterId: string,
  ): Promise<AdminMasterStatsResponseDto['reviewsBreakdown']> {
    const rows = await this.prisma.db.review.groupBy({
      by: ['rating'],
      where: { masterProfileId: masterId, status: ReviewStatus.VISIBLE },
      _count: { _all: true },
    });

    const breakdown: AdminMasterStatsResponseDto['reviewsBreakdown'] = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    for (const row of rows) {
      const key = String(row.rating) as keyof typeof breakdown;
      if (key in breakdown) {
        breakdown[key] = row._count._all;
      }
    }
    return breakdown;
  }

  private async monthlySeries(masterId: string): Promise<MasterStatsMonthPointDto[]> {
    const windowStart = new Date();
    windowStart.setUTCDate(1);
    windowStart.setUTCHours(0, 0, 0, 0);
    windowStart.setUTCMonth(windowStart.getUTCMonth() - (MONTHLY_SERIES_MONTHS - 1));

    const rows = await this.prisma.db.$queryRaw<MonthlySeriesRow[]>`
      SELECT
        series.month AS month,
        COALESCE(created.count, 0) AS bookings,
        COALESCE(completed.count, 0) AS completed,
        COALESCE(completed.revenue, 0) AS revenue
      FROM generate_series(date_trunc('month', ${windowStart}::timestamptz), date_trunc('month', now()), interval '1 month') AS series(month)
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS month, COUNT(*) AS count
        FROM bookings
        WHERE master_profile_id = ${masterId}::uuid AND created_at >= ${windowStart} AND deleted_at IS NULL
        GROUP BY 1
      ) created ON created.month = series.month
      LEFT JOIN (
        SELECT date_trunc('month', completed_at) AS month, COUNT(*) AS count, SUM(price) AS revenue
        FROM bookings
        WHERE master_profile_id = ${masterId}::uuid AND status = 'COMPLETED' AND completed_at >= ${windowStart} AND deleted_at IS NULL
        GROUP BY 1
      ) completed ON completed.month = series.month
      ORDER BY series.month
    `;

    return rows.map((row) => ({
      month: monthKey(row.month),
      bookings: Number(row.bookings),
      completed: Number(row.completed),
      revenue: Number(row.revenue ?? 0).toFixed(2),
    }));
  }

  private async topServices(masterId: string): Promise<MasterStatsTopServiceDto[]> {
    const completed = await this.prisma.db.booking.findMany({
      where: { masterProfileId: masterId, status: BookingStatus.COMPLETED },
      select: { serviceId: true, price: true, service: { select: { title: true } } },
    });

    const byService = new Map<
      string,
      { title: string; completedCount: number; revenue: Prisma.Decimal | number }
    >();
    for (const booking of completed) {
      const entry = byService.get(booking.serviceId) ?? {
        title: booking.service.title,
        completedCount: 0,
        revenue: 0,
      };
      entry.completedCount += 1;
      entry.revenue = Number(entry.revenue) + Number(booking.price);
      byService.set(booking.serviceId, entry);
    }

    return Array.from(byService.entries())
      .map(([serviceId, entry]) => ({
        serviceId,
        title: entry.title,
        completedCount: entry.completedCount,
        revenue: Number(entry.revenue).toFixed(2),
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, TOP_SERVICES_LIMIT);
  }
}
