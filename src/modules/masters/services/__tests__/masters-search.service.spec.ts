import { ApprovalStatus } from '@prisma/client';

import type { FilesService } from '@modules/files/services/files.service';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { MasterNotFoundException } from '../../exceptions/masters.exceptions';
import { MastersSearchService, toMasterPublicDto } from '../masters-search.service';

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
  services: [{ price: 100 }],
  certificates: [],
  portfolioImages: [],
  avatarFileId: null,
  bio: null,
  user: { email: 'rustam@example.com', phone: '+992900000000' },
};

const SERVICE_ENTITY = {
  id: 'svc-1',
  categoryId: 'cat-1',
  title: 'Leak repair',
  description: null,
  priceType: 'FIXED',
  price: 50,
  currency: 'TJS',
  durationMinutes: 60,
};

const build = (
  overrides: {
    findMany?: jest.Mock;
    count?: jest.Mock;
    findFirst?: jest.Mock;
    serviceFindMany?: jest.Mock;
  } = {},
) => {
  const masterProfileDelegate = {
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([ROW]),
    count: overrides.count ?? jest.fn().mockResolvedValue(1),
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(ROW),
  };
  const serviceDelegate = {
    findMany: overrides.serviceFindMany ?? jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    db: { masterProfile: masterProfileDelegate, service: serviceDelegate },
  } as unknown as PrismaService;

  const files = {
    createReadUrlForKey: jest.fn().mockResolvedValue('https://cdn/x'),
  } as unknown as FilesService;

  return { service: new MastersSearchService(prisma, files), masterProfileDelegate };
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

  it('reports a null priceFrom when the master has no active services', async () => {
    const { service } = build({
      findMany: jest.fn().mockResolvedValue([{ ...ROW, services: [] }]),
    });

    const { items } = await service.adminSearch({ page: 1, limit: 20, skip: 0 });

    expect(items[0]?.priceFrom).toBeNull();
  });

  it('reports the lowest active service price', async () => {
    const { service } = build({
      findMany: jest.fn().mockResolvedValue([
        {
          ...ROW,
          services: [{ price: 50 }, { price: 100 }],
        },
      ]),
    });

    const { items } = await service.adminSearch({ page: 1, limit: 20, skip: 0 });

    expect(items[0]?.priceFrom).toBe('50.00');
  });

  it('keeps the lowest price when services are sorted descending', async () => {
    const { service } = build({
      findMany: jest.fn().mockResolvedValue([
        {
          ...ROW,
          services: [{ price: 100 }, { price: 50 }],
        },
      ]),
    });

    const { items } = await service.adminSearch({ page: 1, limit: 20, skip: 0 });

    expect(items[0]?.priceFrom).toBe('50.00');
  });
});

describe('MastersSearchService.getPublicProfile', () => {
  it('returns the public projection for an approved, active master', async () => {
    const { service } = build();

    const result = await service.getPublicProfile('47a7c6e9-c411-42c9-8b64-c30a410e9032');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'mp-1',
        displayName: 'Rustam the Plumber',
        cityName: 'Dushanbe',
        categories: ['Plumbing'],
        ratingAverage: '0.00',
        priceFrom: '100.00',
        hasCertificates: false,
        portfolioImageFileIds: [],
      }),
    );
  });

  it('keeps the lowest price when services are not sorted by price', async () => {
    const { service } = build({
      findFirst: jest.fn().mockResolvedValue({
        ...ROW,
        services: [{ price: 50 }, { price: 100 }],
      }),
    });

    const result = await service.getPublicProfile('47a7c6e9-c411-42c9-8b64-c30a410e9032');

    expect(result.priceFrom).toBe('50.00');
  });

  it('keeps the lowest price when services are sorted descending', async () => {
    const { service } = build({
      findFirst: jest.fn().mockResolvedValue({
        ...ROW,
        services: [{ price: 100 }, { price: 50 }],
      }),
    });

    const result = await service.getPublicProfile('47a7c6e9-c411-42c9-8b64-c30a410e9032');

    expect(result.priceFrom).toBe('50.00');
  });

  it('reports a null priceFrom when the master has no active services', async () => {
    const { service } = build({
      findFirst: jest.fn().mockResolvedValue({ ...ROW, services: [] }),
    });

    const result = await service.getPublicProfile('47a7c6e9-c411-42c9-8b64-c30a410e9032');

    expect(result.priceFrom).toBeNull();
  });

  it('throws MasterNotFoundException when the master is not public', async () => {
    const { service } = build({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(service.getPublicProfile('ghost')).rejects.toBeInstanceOf(MasterNotFoundException);
  });
});

describe('MastersSearchService.assertPublic', () => {
  it('resolves for an approved, active master', async () => {
    const { service } = build();

    await expect(
      service.assertPublic('47a7c6e9-c411-42c9-8b64-c30a410e9032'),
    ).resolves.toBeUndefined();
  });

  it('throws MasterNotFoundException when the master is not public', async () => {
    const { service } = build({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(service.assertPublic('ghost')).rejects.toBeInstanceOf(MasterNotFoundException);
  });
});

describe('MastersSearchService.getActiveServices', () => {
  it('returns the master’s active services mapped to the public DTO', async () => {
    const serviceFindMany = jest.fn().mockResolvedValue([SERVICE_ENTITY]);
    const { service } = build({ serviceFindMany });

    const result = await service.getActiveServices('47a7c6e9-c411-42c9-8b64-c30a410e9032');

    expect(serviceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { masterProfileId: '47a7c6e9-c411-42c9-8b64-c30a410e9032', isActive: true },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: 'svc-1', title: 'Leak repair', price: '50.00' }),
    ]);
  });

  it('throws MasterNotFoundException when the master is not public', async () => {
    const { service } = build({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(service.getActiveServices('ghost')).rejects.toBeInstanceOf(
      MasterNotFoundException,
    );
  });
});

describe('toMasterPublicDto', () => {
  it('truncates a long bio to the preview length with an ellipsis', () => {
    const dto = toMasterPublicDto({ ...ROW, bio: 'x'.repeat(300) } as never, true);

    expect(dto.bio).toHaveLength(201);
    expect(dto.bio?.endsWith('…')).toBe(true);
  });

  it('leaves a short bio untouched', () => {
    const dto = toMasterPublicDto({ ...ROW, bio: 'Short' } as never, true);

    expect(dto.bio).toBe('Short');
  });

  it('derives hasCertificates and the portfolio file ids from the row', () => {
    const dto = toMasterPublicDto(
      {
        ...ROW,
        certificates: [{ id: 'c-1' }],
        portfolioImages: [{ fileId: 'img-1' }, { fileId: 'img-2' }],
      } as never,
      false,
    );

    expect(dto.hasCertificates).toBe(true);
    expect(dto.portfolioImageFileIds).toEqual(['img-1', 'img-2']);
  });
});
