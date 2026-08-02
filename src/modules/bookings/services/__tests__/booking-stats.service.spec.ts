import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { BookingStatsService } from '../booking-stats.service';

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const masterProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue({ id: 'mp-1', profileViews: 42 }),
    ...overrides.masterProfile,
  };
  const bookingDelegate = {
    aggregate: jest.fn().mockResolvedValue({ _sum: { price: null } }),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
    ...overrides.booking,
  };
  const prisma = {
    db: { masterProfile: masterProfileDelegate, booking: bookingDelegate },
  } as unknown as PrismaService;

  return { service: new BookingStatsService(prisma), masterProfileDelegate, bookingDelegate };
};

describe('BookingStatsService.getMasterStats', () => {
  it('throws when no profile exists', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.getMasterStats('ghost')).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('returns zeroed analytics with no bookings', async () => {
    const { service } = build();

    const stats = await service.getMasterStats('user-1');

    expect(stats.totalEarnings).toBe('0.00');
    expect(stats.earningsByCategory).toEqual([]);
    expect(stats.avgAcceptLatencyMinutes).toBeNull();
    expect(stats.repeatClientRate).toBe(0);
    expect(stats.profileViews).toBe(42);
  });

  it('computes category breakdown, accept latency and repeat-client rate', async () => {
    const completed = [
      {
        price: 100,
        clientProfileId: 'client-1',
        service: { categoryId: 'cat-1', category: { name: 'Plumbing' } },
      },
      {
        price: 50,
        clientProfileId: 'client-1',
        service: { categoryId: 'cat-1', category: { name: 'Plumbing' } },
      },
      {
        price: 80,
        clientProfileId: 'client-2',
        service: { categoryId: 'cat-2', category: { name: 'Electrics' } },
      },
    ];
    const accepted = [
      { createdAt: new Date('2026-01-01T00:00:00Z'), acceptedAt: new Date('2026-01-01T00:10:00Z') },
      { createdAt: new Date('2026-01-02T00:00:00Z'), acceptedAt: new Date('2026-01-02T00:30:00Z') },
    ];

    const findMany = jest
      .fn()
      .mockResolvedValueOnce([]) // windowBookings
      .mockResolvedValueOnce(completed) // completedBookings
      .mockResolvedValueOnce(accepted); // acceptedBookings

    const { service } = build({ booking: { findMany } });

    const stats = await service.getMasterStats('user-1');

    expect(stats.earningsByCategory).toEqual([
      { categoryId: 'cat-1', categoryName: 'Plumbing', total: '150.00', completedCount: 2 },
      { categoryId: 'cat-2', categoryName: 'Electrics', total: '80.00', completedCount: 1 },
    ]);
    expect(stats.avgAcceptLatencyMinutes).toBe(20);
    expect(stats.repeatClientRate).toBe(50);
  });
});
