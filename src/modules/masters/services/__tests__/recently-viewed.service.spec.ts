import type { PrismaService } from '@prisma-lib/prisma.service';

import { MasterNotFoundException } from '../../exceptions/masters.exceptions';
import { RecentlyViewedService } from '../recently-viewed.service';

const PUBLIC_MASTER_ROW = {
  id: 'mp-1',
  displayName: 'Bob',
  avatarFileId: null,
  bannerFileId: null,
  bio: null,
  yearsOfExperience: 5,
  serviceRadiusKm: 10,
  ratingAverage: { toFixed: () => '4.50' },
  ratingCount: 10,
  completedBookingsCount: 20,
  isActive: true,
  approvalStatus: 'APPROVED',
  createdAt: new Date(),
  whatsappPhone: null,
  whatsappEnabled: false,
  avgAcceptLatencyMinutes: null,
  city: { name: 'Dushanbe', nameTj: null, nameRu: null, latitude: null, longitude: null },
  categories: [],
  services: [],
  certificates: [],
  portfolioImages: [],
};

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
    recentlyViewedMaster?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }),
        ...overrides.clientProfile,
      },
      masterProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'mp-1' }),
        ...overrides.masterProfile,
      },
      recentlyViewedMaster: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ masterProfile: PUBLIC_MASTER_ROW }]),
        ...overrides.recentlyViewedMaster,
      },
    },
  } as unknown as PrismaService;

  return { service: new RecentlyViewedService(prisma), prisma };
};

describe('RecentlyViewedService', () => {
  it('recordView throws MasterNotFoundException for an unapproved/inactive master', async () => {
    const { service } = build({ masterProfile: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.recordView('user-1', 'mp-1')).rejects.toThrow(MasterNotFoundException);
  });

  it('recordView upserts a (client, master) row', async () => {
    const { service, prisma } = build();

    await service.recordView('user-1', 'mp-1');

    expect(prisma.db.recentlyViewedMaster.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientProfileId_masterProfileId: { clientProfileId: 'cp-1', masterProfileId: 'mp-1' },
        },
      }),
    );
  });

  it('list returns the caller’s viewed masters via the public projection', async () => {
    const { service } = build();

    const result = await service.list('user-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('mp-1');
  });
});
