import { randomUUID } from 'node:crypto';

import { ApprovalStatus, PriceType, PrismaClient } from '@prisma/client';

/**
 * ROADMAP.md Phase 5 exit criterion / NFR-P-2: seeds 50,000 approved, active masters
 * (one service each) so `k6/search.js` measures a p95 against the scale the NFR names,
 * not the dev seed's handful of masters. Never run against a shared environment —
 * `npm run seed:scale` is a local/staging-only load-test fixture, not reference data.
 *
 * Usage: npm run seed:scale [-- <masterCount>]  (default 50000)
 */
const MASTER_COUNT = Number(process.argv[2] ?? 50_000);
const BATCH_SIZE = 1000;
const PLACEHOLDER_PASSWORD_HASH = '$2b$10$'.padEnd(60, 'x');

const cycle = <T>(items: readonly T[], index: number): T => {
  const item = items[index % items.length];
  if (item === undefined) {
    throw new Error('cycle() called with an empty array');
  }
  return item;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const buildRow = (index: number, cityId: string, categoryId: string) => {
  const userId = randomUUID();
  const masterProfileId = randomUUID();

  return {
    user: {
      id: userId,
      email: `loadtest-master-${String(index)}@ustogo.test`,
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      role: 'MASTER' as const,
      status: 'ACTIVE' as const,
    },
    masterProfile: {
      id: masterProfileId,
      userId,
      firstName: 'Load',
      lastName: `Test${String(index)}`,
      displayName: `Load Test Master ${String(index)}`,
      cityId,
      timezone: 'Asia/Dushanbe',
      approvalStatus: ApprovalStatus.APPROVED,
      isActive: true,
      approvedAt: new Date(),
      ratingAverage: Number((Math.random() * 5).toFixed(2)),
      ratingCount: Math.floor(Math.random() * 200),
    },
    service: {
      id: randomUUID(),
      masterProfileId,
      categoryId,
      title: `Load test service ${String(index)}`,
      priceType: PriceType.FIXED,
      price: Math.floor(50 + Math.random() * 950),
      currency: 'TJS',
      durationMinutes: 60,
      isActive: true,
    },
  };
};

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();

  try {
    const cities = await prisma.city.findMany({ where: { isActive: true }, select: { id: true } });
    const leafCategories = await prisma.category.findMany({
      where: { isActive: true, children: { none: {} } },
      select: { id: true },
    });

    if (cities.length === 0 || leafCategories.length === 0) {
      throw new Error('Run the reference seed first: npx prisma db seed');
    }

    console.log(`Seeding ${String(MASTER_COUNT)} masters...`);

    const rows = Array.from({ length: MASTER_COUNT }, (_, i) =>
      buildRow(i, cycle(cities, i).id, cycle(leafCategories, i).id),
    );

    for (const batch of chunk(rows, BATCH_SIZE)) {
      await prisma.user.createMany({ data: batch.map((r) => r.user) });
      await prisma.masterProfile.createMany({ data: batch.map((r) => r.masterProfile) });
      await prisma.service.createMany({ data: batch.map((r) => r.service) });
      process.stdout.write('.');
    }

    console.log(`\nSeeded ${String(MASTER_COUNT)} masters with one service each.`);
  } finally {
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  console.error('Scale seed failed:', error);
  process.exitCode = 1;
});
