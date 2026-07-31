import { PrismaClient } from '@prisma/client';

import { seedCategories } from './categories.seed';
import { seedCities } from './cities.seed';
import { seedMasters } from './masters.seed';

/**
 * Reference data only. Seeds are idempotent so that running this against an existing
 * database is safe.
 *
 * The administrator account is deliberately not seeded: `PROJECT_RULES.md` forbids an
 * admin registration path, and a seeded admin with a known password in a shared
 * environment is exactly that path by another name. Admins are created by the CLI
 * (`npm run cli -- admin:create`, TODO §1.10) with an interactively entered password.
 */
const main = async (): Promise<void> => {
  const prisma = new PrismaClient();

  try {
    const cityCount = await seedCities(prisma);
    console.log(`Seeded ${String(cityCount)} cities`);

    const categoryCount = await seedCategories(prisma);
    console.log(`Seeded ${String(categoryCount)} categories`);

    const masterCount = await seedMasters(prisma);
    console.log(`Seeded ${String(masterCount)} masters`);
  } finally {
    await prisma.$disconnect();
  }
};

void main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
