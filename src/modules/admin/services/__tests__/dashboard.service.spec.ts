import { BookingStatus } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import type { DashboardQueryDto } from '../../dto/requests/dashboard-query.dto';
import { DashboardRangeInvalidException } from '../../exceptions/admin.exceptions';
import { DashboardService } from '../dashboard.service';

const build = (
  overrides: {
    booking?: Partial<Record<string, jest.Mock>>;
    review?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      user: { count: jest.fn().mockResolvedValue(0) },
      masterProfile: { count: jest.fn().mockResolvedValue(0) },
      booking: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        ...overrides.booking,
      },
      review: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null } }),
        ...overrides.review,
      },
      service: { findMany: jest.fn().mockResolvedValue([]), ...overrides.service },
      $queryRaw: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  return { prisma, service: new DashboardService(prisma) };
};

const QUERY: DashboardQueryDto = {
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-30T00:00:00.000Z',
};

describe('DashboardService', () => {
  it('rejects a range with `to` before `from`', async () => {
    const { service } = build();

    await expect(
      service.getDashboard({ from: '2026-07-30T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' }),
    ).rejects.toThrow(DashboardRangeInvalidException);
  });

  it('rejects a range spanning more than 366 days', async () => {
    const { service } = build();

    await expect(
      service.getDashboard({ from: '2020-01-01T00:00:00.000Z', to: '2026-07-30T00:00:00.000Z' }),
    ).rejects.toThrow(DashboardRangeInvalidException);
  });

  it('buckets rejected and every cancellation reason under `cancelled`', async () => {
    const { service } = build({
      booking: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([
          { status: BookingStatus.COMPLETED, _count: { _all: 4 } },
          { status: BookingStatus.REJECTED, _count: { _all: 1 } },
          { status: BookingStatus.CANCELLED_BY_CLIENT, _count: { _all: 2 } },
          { status: BookingStatus.CANCELLED_BY_MASTER, _count: { _all: 1 } },
          { status: BookingStatus.CANCELLED_BY_ADMIN, _count: { _all: 1 } },
          { status: BookingStatus.PENDING, _count: { _all: 1 } },
        ]),
      },
    });

    const result = await service.getDashboard(QUERY);

    expect(result.bookings.completed).toBe(4);
    expect(result.bookings.cancelled).toBe(5);
    expect(result.bookings.pending).toBe(1);
    expect(result.rates.completionRate).toBe(4 / 10);
    expect(result.rates.cancellationRate).toBe(5 / 10);
  });

  it('returns zero rates rather than dividing by zero when no bookings exist in range', async () => {
    const { service } = build();

    const result = await service.getDashboard(QUERY);

    expect(result.rates).toEqual({ completionRate: 0, cancellationRate: 0, acceptanceRate: 0 });
  });

  it('folds grouped booking counts into categories via their service, sorted desc, capped at 10', async () => {
    const grouped = Array.from({ length: 12 }, (_, i) => ({
      serviceId: `service-${i}`,
      _count: { _all: 12 - i },
    }));
    const services = Array.from({ length: 12 }, (_, i) => ({
      id: `service-${i}`,
      category: { id: `category-${i % 3}`, name: `Category ${i % 3}` },
    }));

    const { service } = build({
      booking: { groupBy: jest.fn().mockResolvedValue(grouped) },
      service: { findMany: jest.fn().mockResolvedValue(services) },
    });

    const result = await service.getDashboard(QUERY);

    expect(result.topCategories).toHaveLength(3);
    expect(result.topCategories[0]?.bookings).toBeGreaterThanOrEqual(
      result.topCategories[1]?.bookings ?? 0,
    );
  });

  it('reports zero average rating rather than null when no review exists in range', async () => {
    const { service } = build();

    const result = await service.getDashboard(QUERY);

    expect(result.reviews.averageRating).toBe(0);
  });
});
