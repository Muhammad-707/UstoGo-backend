import type { PrismaService } from '@prisma-lib/prisma.service';

import { MasterNotFoundException } from '../../exceptions/masters.exceptions';
import { AdminMasterStatsService } from '../admin-master-stats.service';

const MASTER = { id: 'master-1', ratingAverage: '4.50', ratingCount: 10 };

/**
 * `getStats` runs two independent `booking.findMany` calls (distinct clients and
 * completed-bookings-for-top-services) — distinguished here by the query's `select`
 * shape, the same way Prisma itself would receive two structurally different calls.
 */
const bookingFindMany = (
  distinctClientRows: { clientProfileId: string }[],
  completedForServicesRows: { serviceId: string; price: string; service: { title: string } }[],
) =>
  jest.fn().mockImplementation((args: { select?: Record<string, unknown> }) => {
    if (
      args.select?.['clientProfileId'] !== undefined &&
      args.select?.['serviceId'] === undefined
    ) {
      return Promise.resolve(distinctClientRows);
    }
    return Promise.resolve(completedForServicesRows);
  });

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
    review?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue(MASTER),
        ...overrides.masterProfile,
      },
      booking: {
        count: jest.fn().mockResolvedValue(0),
        findMany: bookingFindMany([], []),
        ...overrides.booking,
      },
      review: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        ...overrides.review,
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  return { prisma, service: new AdminMasterStatsService(prisma) };
};

describe('AdminMasterStatsService.getStats', () => {
  it('throws MasterNotFoundException for an unknown master', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.getStats('nope')).rejects.toThrow(MasterNotFoundException);
  });

  it('counts distinct clients from COMPLETED bookings', async () => {
    const { service } = build({
      booking: {
        count: jest.fn().mockResolvedValue(0),
        findMany: bookingFindMany([{ clientProfileId: 'c1' }, { clientProfileId: 'c2' }], []),
      },
    });

    const stats = await service.getStats('master-1');

    expect(stats.totalClientsServed).toBe(2);
  });

  it('carries ratingAverage/ratingCount from the master profile', async () => {
    const { service } = build();

    const stats = await service.getStats('master-1');

    expect(stats.avgRating).toBe(4.5);
    expect(stats.ratingCount).toBe(10);
  });

  it('computes nps from visible reviews’ npsScore', async () => {
    const { service } = build({
      review: {
        findMany: jest.fn().mockResolvedValue([{ npsScore: 10 }, { npsScore: 0 }]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });

    const stats = await service.getStats('master-1');

    expect(stats.nps).toBe(0);
    expect(stats.npsResponseCount).toBe(2);
  });

  it('reports null nps with zero responses', async () => {
    const { service } = build();

    const stats = await service.getStats('master-1');

    expect(stats.nps).toBeNull();
    expect(stats.npsResponseCount).toBe(0);
  });

  it('fills the 1–5 review-star breakdown from groupBy rows, defaulting missing stars to 0', async () => {
    const { service } = build({
      review: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([
          { rating: 5, _count: { _all: 7 } },
          { rating: 3, _count: { _all: 1 } },
        ]),
      },
    });

    const stats = await service.getStats('master-1');

    expect(stats.reviewsBreakdown).toEqual({ '1': 0, '2': 0, '3': 1, '4': 0, '5': 7 });
  });

  it('maps the monthly series from the raw query', async () => {
    const { service, prisma } = build();
    (prisma.db.$queryRaw as jest.Mock).mockResolvedValue([
      { month: new Date('2026-07-01T00:00:00Z'), bookings: 3n, completed: 2n, revenue: '150.00' },
    ]);

    const stats = await service.getStats('master-1');

    expect(stats.monthlySeries).toEqual([
      { month: '2026-07', bookings: 3, completed: 2, revenue: '150.00' },
    ]);
  });

  it('aggregates top services by revenue, highest first', async () => {
    const { service } = build({
      booking: {
        count: jest.fn().mockResolvedValue(0),
        findMany: bookingFindMany(
          [],
          [
            { serviceId: 's1', price: '100.00', service: { title: 'Wiring' } },
            { serviceId: 's2', price: '300.00', service: { title: 'Plumbing' } },
            { serviceId: 's1', price: '100.00', service: { title: 'Wiring' } },
          ],
        ),
      },
    });

    const stats = await service.getStats('master-1');

    expect(stats.topServices).toEqual([
      { serviceId: 's2', title: 'Plumbing', completedCount: 1, revenue: '300.00' },
      { serviceId: 's1', title: 'Wiring', completedCount: 2, revenue: '200.00' },
    ]);
  });
});
