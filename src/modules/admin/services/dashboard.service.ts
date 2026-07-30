import { Injectable } from '@nestjs/common';
import { ApprovalStatus, BookingStatus, ReviewStatus, UserRole, UserStatus } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { isValidDashboardRange, resolveDashboardRange } from '../domain/dashboard-range.util';
import type { DashboardQueryDto } from '../dto/requests/dashboard-query.dto';
import type {
  DashboardResponseDto,
  DashboardSeriesPointDto,
  DashboardTopCategoryDto,
} from '../dto/responses/dashboard.response.dto';
import { DashboardRangeInvalidException } from '../exceptions/admin.exceptions';

const CANCELLED_STATUSES: BookingStatus[] = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED_BY_CLIENT,
  BookingStatus.CANCELLED_BY_MASTER,
  BookingStatus.CANCELLED_BY_ADMIN,
];

type SeriesRow = { date: Date; created: bigint; completed: bigint };
type StatusCounts = Partial<Record<BookingStatus, number>>;

const rate = (numerator: number, total: number): number => (total > 0 ? numerator / total : 0);

const shapeBookings = (
  byStatus: StatusCounts,
  acceptedCount: number,
  total: number,
): Pick<DashboardResponseDto, 'bookings' | 'rates'> => {
  const cancelled = CANCELLED_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
  const completed = byStatus[BookingStatus.COMPLETED] ?? 0;

  return {
    bookings: {
      pending: byStatus[BookingStatus.PENDING] ?? 0,
      accepted: byStatus[BookingStatus.ACCEPTED] ?? 0,
      inProgress: byStatus[BookingStatus.IN_PROGRESS] ?? 0,
      completed,
      cancelled,
      expired: byStatus[BookingStatus.EXPIRED] ?? 0,
    },
    rates: {
      completionRate: rate(completed, total),
      cancellationRate: rate(cancelled, total),
      acceptanceRate: rate(acceptedCount, total),
    },
  };
};

/** F-15 (MODULES.md › AdminModule). Read-only aggregate queries; owns no table of its own. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(query: DashboardQueryDto): Promise<DashboardResponseDto> {
    const { from, to } = resolveDashboardRange(query.from, query.to);
    if (!isValidDashboardRange(from, to)) {
      throw new DashboardRangeInvalidException();
    }

    const [
      users,
      masters,
      bookingsByStatus,
      acceptedCount,
      totalBookings,
      reviews,
      topCategories,
      series,
    ] = await Promise.all([
      this.countUsers(),
      this.countMasters(),
      this.groupBookingsByStatus(from, to),
      this.prisma.db.booking.count({
        where: { createdAt: { gte: from, lte: to }, acceptedAt: { not: null } },
      }),
      this.prisma.db.booking.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.aggregateReviews(from, to),
      this.topCategoriesByBookingVolume(from, to),
      this.dailySeries(from, to),
    ]);

    return {
      users,
      masters,
      ...shapeBookings(bookingsByStatus, acceptedCount, totalBookings),
      reviews,
      topCategories,
      series,
    };
  }

  private async countUsers(): Promise<DashboardResponseDto['users']> {
    const [clients, masters, admins, blocked] = await Promise.all([
      this.prisma.db.user.count({ where: { role: UserRole.CLIENT } }),
      this.prisma.db.user.count({ where: { role: UserRole.MASTER } }),
      this.prisma.db.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.db.user.count({ where: { status: UserStatus.BLOCKED } }),
    ]);

    return { clients, masters, admins, blocked };
  }

  private async countMasters(): Promise<DashboardResponseDto['masters']> {
    const [pending, approved, rejected, inactive] = await Promise.all([
      this.prisma.db.masterProfile.count({ where: { approvalStatus: ApprovalStatus.PENDING } }),
      this.prisma.db.masterProfile.count({
        where: { approvalStatus: ApprovalStatus.APPROVED, isActive: true },
      }),
      this.prisma.db.masterProfile.count({ where: { approvalStatus: ApprovalStatus.REJECTED } }),
      this.prisma.db.masterProfile.count({
        where: { approvalStatus: ApprovalStatus.APPROVED, isActive: false },
      }),
    ]);

    return { pending, approved, rejected, inactive };
  }

  private async groupBookingsByStatus(from: Date, to: Date): Promise<StatusCounts> {
    const rows = await this.prisma.db.booking.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });

    return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
  }

  private async aggregateReviews(from: Date, to: Date): Promise<DashboardResponseDto['reviews']> {
    const [count, aggregate] = await Promise.all([
      this.prisma.db.review.count({
        where: { status: ReviewStatus.VISIBLE, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.db.review.aggregate({
        where: { status: ReviewStatus.VISIBLE, createdAt: { gte: from, lte: to } },
        _avg: { rating: true },
      }),
    ]);

    return { count, averageRating: aggregate._avg.rating ?? 0 };
  }

  private async topCategoriesByBookingVolume(
    from: Date,
    to: Date,
  ): Promise<DashboardTopCategoryDto[]> {
    const grouped = await this.prisma.db.booking.groupBy({
      by: ['serviceId'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });

    if (grouped.length === 0) {
      return [];
    }

    const services = await this.prisma.db.service.findMany({
      where: { id: { in: grouped.map((row) => row.serviceId) } },
      select: { id: true, category: { select: { id: true, name: true } } },
    });
    const categoryByServiceId = new Map(services.map((service) => [service.id, service.category]));

    const bookingsByCategory = new Map<string, { name: string; bookings: number }>();
    for (const row of grouped) {
      const category = categoryByServiceId.get(row.serviceId);
      if (category === undefined) {
        continue;
      }
      const existing = bookingsByCategory.get(category.id) ?? { name: category.name, bookings: 0 };
      existing.bookings += row._count._all;
      bookingsByCategory.set(category.id, existing);
    }

    return Array.from(bookingsByCategory.entries())
      .map(([categoryId, value]) => ({ categoryId, name: value.name, bookings: value.bookings }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 10);
  }

  private async dailySeries(from: Date, to: Date): Promise<DashboardSeriesPointDto[]> {
    const rows = await this.prisma.db.$queryRaw<SeriesRow[]>`
      SELECT
        series.day::date AS date,
        COALESCE(created.count, 0) AS created,
        COALESCE(completed.count, 0) AS completed
      FROM generate_series(date_trunc('day', ${from}::timestamptz), date_trunc('day', ${to}::timestamptz), interval '1 day') AS series(day)
      LEFT JOIN (
        SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
        FROM bookings
        WHERE created_at BETWEEN ${from} AND ${to} AND deleted_at IS NULL
        GROUP BY 1
      ) created ON created.day = series.day
      LEFT JOIN (
        SELECT date_trunc('day', completed_at) AS day, COUNT(*) AS count
        FROM bookings
        WHERE completed_at BETWEEN ${from} AND ${to} AND deleted_at IS NULL
        GROUP BY 1
      ) completed ON completed.day = series.day
      ORDER BY series.day
    `;

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      created: Number(row.created),
      completed: Number(row.completed),
    }));
  }
}
