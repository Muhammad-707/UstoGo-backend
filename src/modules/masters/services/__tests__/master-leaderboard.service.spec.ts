import type { PrismaService } from '@prisma-lib/prisma.service';

import { MasterLeaderboardService } from '../master-leaderboard.service';

const NOW = Date.now();

// Mimics Prisma.Decimal closely enough for this service: `toFixed` for display,
// plus `Number(...)` coercion (via `toString`) for the badge threshold math.
const decimal = (value: string) => ({ toFixed: () => value, toString: () => value });

const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'mp-1',
  displayName: 'Bob',
  avatarFileId: null,
  bannerFileId: null,
  bio: null,
  yearsOfExperience: 5,
  serviceRadiusKm: 10,
  ratingAverage: decimal('4.80'),
  ratingCount: 15,
  completedBookingsCount: 60,
  isActive: true,
  approvalStatus: 'APPROVED',
  createdAt: new Date(NOW - 365 * 24 * 60 * 60_000),
  whatsappPhone: null,
  whatsappEnabled: false,
  avgAcceptLatencyMinutes: null,
  city: { name: 'Dushanbe', nameTj: null, nameRu: null, latitude: null, longitude: null },
  categories: [],
  services: [],
  certificates: [],
  portfolioImages: [],
  ...overrides,
});

// avgAcceptLatencyMinutes is a Decimal-like value elsewhere; here Number(...) on a
// plain number works identically, matching how the service reads it.
const withNumberAsDecimal = (value: number) => value as unknown as { toFixed: () => string };

const build = (rows: ReturnType<typeof row>[]) => {
  const prisma = {
    db: {
      masterProfile: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    },
  } as unknown as PrismaService;

  return { service: new MasterLeaderboardService(prisma), prisma };
};

describe('MasterLeaderboardService.list', () => {
  it('ranks masters 1-based in query order', async () => {
    const { service } = build([row({ id: 'mp-1' }), row({ id: 'mp-2' })]);

    const result = await service.list({});

    expect(result.map((entry) => [entry.rank, entry.master.id])).toEqual([
      [1, 'mp-1'],
      [2, 'mp-2'],
    ]);
  });

  it('awards TOP_RATED only above the rating and sample-size thresholds', async () => {
    const { service } = build([
      row({ id: 'mp-1', ratingAverage: decimal('4.80'), ratingCount: 15 }),
      row({ id: 'mp-2', ratingAverage: decimal('4.80'), ratingCount: 2 }),
    ]);

    const result = await service.list({});

    expect(result[0]?.badges).toContain('TOP_RATED');
    expect(result[1]?.badges).not.toContain('TOP_RATED');
  });

  it('awards MOST_BOOKED to only the top 3 by result-set rank', async () => {
    const rows = [1, 2, 3, 4].map((n) => row({ id: `mp-${String(n)}` }));
    const { service } = build(rows);

    const result = await service.list({});

    expect(result.slice(0, 3).every((entry) => entry.badges.includes('MOST_BOOKED'))).toBe(true);
    expect(result[3]?.badges).not.toContain('MOST_BOOKED');
  });

  it('awards RISING_STAR only for a recent, well-rated master with enough bookings', async () => {
    const { service } = build([
      row({
        id: 'mp-1',
        createdAt: new Date(NOW - 10 * 24 * 60 * 60_000),
        completedBookingsCount: 5,
        ratingAverage: decimal('4.50'),
      }),
      row({ id: 'mp-2', createdAt: new Date(NOW - 365 * 24 * 60 * 60_000) }),
    ]);

    const result = await service.list({});

    expect(result[0]?.badges).toContain('RISING_STAR');
    expect(result[1]?.badges).not.toContain('RISING_STAR');
  });

  it('awards FAST_RESPONDER using the shared master-public threshold', async () => {
    const { service } = build([
      row({
        id: 'mp-1',
        avgAcceptLatencyMinutes: withNumberAsDecimal(10),
        completedBookingsCount: 10,
      }),
      row({
        id: 'mp-2',
        avgAcceptLatencyMinutes: withNumberAsDecimal(120),
        completedBookingsCount: 10,
      }),
    ]);

    const result = await service.list({});

    expect(result[0]?.badges).toContain('FAST_RESPONDER');
    expect(result[1]?.badges).not.toContain('FAST_RESPONDER');
  });
});
