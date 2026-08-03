import { randomUUID } from 'node:crypto';

import { ApprovalStatus, PriceType, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

import { DEMO_MASTERS } from './demo-masters.data';

/**
 * Reference demo masters — real database rows (not frontend mock data), one per leaf
 * category, so the client app has something genuine to search/browse/book against.
 * All accounts share one known password so they are usable for manual/demo login.
 * Idempotent on `User.email`.
 */
const DEMO_PASSWORD = 'Password123!';

type DemoMaster = (typeof DEMO_MASTERS)[number];

type CreateOpsInput = {
  readonly prisma: PrismaClient;
  readonly m: DemoMaster;
  readonly passwordHash: string;
  readonly userId: string;
  readonly masterProfileId: string;
  readonly categoryId: string;
  readonly cityId: string;
};

const buildWorkingDayOps = (prisma: PrismaClient, masterProfileId: string) =>
  [1, 2, 3, 4, 5, 6].map((weekday) =>
    prisma.workingDay.create({
      data: {
        masterProfileId,
        weekday,
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
    }),
  );

const buildProfileOps = ({
  prisma,
  m,
  passwordHash,
  userId,
  masterProfileId,
  cityId,
}: CreateOpsInput) => [
  prisma.user.create({
    data: {
      id: userId,
      email: m.email,
      phone: m.phone,
      passwordHash,
      role: 'MASTER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  }),
  prisma.masterProfile.create({
    data: {
      id: masterProfileId,
      userId,
      firstName: m.firstName,
      lastName: m.lastName,
      displayName: m.displayName,
      bio: m.bio,
      yearsOfExperience: m.years,
      cityId,
      timezone: 'Asia/Dushanbe',
      // P0: demo masters are reachable on WhatsApp at their registration number.
      whatsappPhone: m.phone,
      approvalStatus: ApprovalStatus.APPROVED,
      isActive: true,
      approvedAt: new Date(),
    },
  }),
];

const buildServiceOps = ({ prisma, m, masterProfileId, categoryId }: CreateOpsInput) => [
  prisma.masterCategory.create({ data: { masterProfileId, categoryId } }),
  prisma.service.create({
    data: {
      masterProfileId,
      categoryId,
      title: m.title,
      description: m.bio,
      priceType: PriceType.FIXED,
      price: m.price,
      currency: 'TJS',
      durationMinutes: m.duration,
      isActive: true,
    },
  }),
];

const buildCreateOps = (input: CreateOpsInput) => [
  ...buildProfileOps(input),
  ...buildServiceOps(input),
  ...buildWorkingDayOps(input.prisma, input.masterProfileId),
];

const seedOneMaster = async (
  prisma: PrismaClient,
  m: DemoMaster,
  passwordHash: string,
): Promise<boolean> => {
  const existing = await prisma.user.findFirst({ where: { email: m.email } });
  if (existing) return false;

  const category = await prisma.category.findUnique({ where: { slug: m.slug } });
  const city = await prisma.city.findFirst({ where: { name: m.city } });
  if (!category || !city) return false;

  const userId = randomUUID();
  const masterProfileId = randomUUID();

  await prisma.$transaction(
    buildCreateOps({
      prisma,
      m,
      passwordHash,
      userId,
      masterProfileId,
      categoryId: category.id,
      cityId: city.id,
    }),
  );

  return true;
};

export const seedMasters = async (prisma: PrismaClient): Promise<number> => {
  const passwordHash = await hash(DEMO_PASSWORD, 12);
  let count = 0;

  for (const m of DEMO_MASTERS) {
    const created = await seedOneMaster(prisma, m, passwordHash);
    if (created) count += 1;
  }

  return count;
};
