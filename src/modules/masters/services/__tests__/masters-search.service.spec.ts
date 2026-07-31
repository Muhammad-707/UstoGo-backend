import { ApprovalStatus } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import { MastersSearchService } from '../masters-search.service';

const ROW = {
  id: 'mp-1',
  displayName: 'Rustam the Plumber',
  approvalStatus: ApprovalStatus.PENDING,
  isActive: false,
  ratingAverage: { toFixed: (n: number) => (0).toFixed(n) },
  ratingCount: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  city: { name: 'Dushanbe' },
  categories: [{ category: { name: 'Plumbing' } }],
  services: [{ price: { toFixed: (n: number) => (100).toFixed(n) } }],
  certificates: [],
  user: { email: 'rustam@example.com', phone: '+992900000000' },
};

const build = (overrides: { findMany?: jest.Mock; count?: jest.Mock } = {}) => {
  const masterProfileDelegate = {
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([ROW]),
    count: overrides.count ?? jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    db: { masterProfile: masterProfileDelegate },
  } as unknown as PrismaService;

  return { service: new MastersSearchService(prisma), masterProfileDelegate };
};

describe('MastersSearchService.adminSearch', () => {
  it('maps rows to the admin projection, including contact details', async () => {
    const { service } = build();

    const { items, total } = await service.adminSearch({
      page: 1,
      limit: 20,
      skip: 0,
    });

    expect(total).toBe(1);
    expect(items).toEqual([
      expect.objectContaining({
        id: 'mp-1',
        email: 'rustam@example.com',
        phone: '+992900000000',
        cityName: 'Dushanbe',
        categories: ['Plumbing'],
        approvalStatus: ApprovalStatus.PENDING,
        isActive: false,
        priceFrom: '100.00',
      }),
    ]);
  });

  it('filters by approvalStatus, status, cityId and categoryId', async () => {
    const { service, masterProfileDelegate } = build();

    await service.adminSearch({
      page: 1,
      limit: 20,
      skip: 0,
      approvalStatus: ApprovalStatus.APPROVED,
      status: true,
      cityId: 'city-1',
      categoryId: 'cat-1',
    });

    expect(masterProfileDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          approvalStatus: ApprovalStatus.APPROVED,
          isActive: true,
          cityId: 'city-1',
          categories: { some: { categoryId: 'cat-1' } },
        },
      }),
    );
  });

  it('matches display name or email when searching', async () => {
    const { service, masterProfileDelegate } = build();

    await service.adminSearch({
      page: 1,
      limit: 20,
      skip: 0,
      search: 'rustam',
    });

    expect(masterProfileDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { displayName: { contains: 'rustam', mode: 'insensitive' } },
            { user: { email: { contains: 'rustam', mode: 'insensitive' } } },
          ],
        }),
      }),
    );
  });

  it('returns an empty page with no rows', async () => {
    const { service } = build({
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    });

    const { items, total } = await service.adminSearch({
      page: 1,
      limit: 20,
      skip: 0,
    });

    expect(items).toEqual([]);
    expect(total).toBe(0);
  });
});
