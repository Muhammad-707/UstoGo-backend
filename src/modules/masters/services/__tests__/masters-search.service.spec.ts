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
  completedBookingsCount: 0,
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
    findUnique?: jest.Mock;
    serviceFindMany?: jest.Mock;
    bookingGroupBy?: jest.Mock;
    fileFindMany?: jest.Mock;
  } = {},
) => {
  const masterProfileDelegate = {
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([ROW]),
    count: overrides.count ?? jest.fn().mockResolvedValue(1),
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(ROW),
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(ROW),
  };
  const serviceDelegate = {
    findMany: overrides.serviceFindMany ?? jest.fn().mockResolvedValue([]),
  };
  const bookingDelegate = {
    groupBy: overrides.bookingGroupBy ?? jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    db: {
      masterProfile: masterProfileDelegate,
      service: serviceDelegate,
      booking: bookingDelegate,
      file: {
        findMany: overrides.fileFindMany ?? jest.fn().mockResolvedValue([]),
      },
    },
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
        completedBookingsCount: 0,
        totalEarnings: '0.00',
      }),
    ]);
  });

  it('attaches completed-booking earnings from a batched groupBy', async () => {
    const { service } = build({
      bookingGroupBy: jest
        .fn()
        .mockResolvedValue([{ masterProfileId: 'mp-1', _sum: { price: 250 } }]),
    });

    const { items } = await service.adminSearch({ page: 1, limit: 20, skip: 0 });

    expect(items[0]?.totalEarnings).toBe('250.00');
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

describe('MastersSearchService.getPublicMedia', () => {
  it('falls back to gender-matched stock avatar, profession banner and portfolio', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      displayName: 'Marcus Vance',
      avatarFileId: null,
      bannerFileId: null,
      categories: [{ category: { slug: 'plumbing' } }],
      portfolioImages: [],
    });
    const { service } = build({ findUnique });

    const media = await service.getPublicMedia('47a7c6e9-c411-42c9-8b64-c30a410e9032');

    expect(media.avatarUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-\d/);
    expect(media.bannerUrl).toBe(
      'https://images.unsplash.com/photo-1585128792020-803d29415281?auto=format&fit=crop&w=1200&q=80',
    );
    expect(media.portfolio).toHaveLength(4);
    for (const image of media.portfolio) {
      expect(image.fileId).toMatch(/^stock-plumbing-\d$/);
      expect(image.url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-\d/);
    }
  });

  it('uses a female stock avatar for a female first name', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      displayName: 'Sarah Jenkins',
      avatarFileId: null,
      bannerFileId: null,
      categories: [{ category: { slug: 'interior-design' } }],
      portfolioImages: [],
    });
    const { service } = build({ findUnique });

    const media = await service.getPublicMedia('47a7c6e9-c411-42c9-8b64-c30a410e9032');

    expect(media.avatarUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-\d/);
    expect(media.bannerUrl).toBe(
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80',
    );
  });

  it('mints presigned URLs for uploaded files and keeps the uploaded portfolio', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      displayName: 'Marcus Vance',
      avatarFileId: 'file-avatar',
      bannerFileId: 'file-banner',
      categories: [{ category: { slug: 'plumbing' } }],
      portfolioImages: [{ fileId: 'file-1', caption: 'Bathroom' }],
    });
    const fileFindMany = jest.fn().mockResolvedValue([
      { id: 'file-avatar', key: 'k-avatar' },
      { id: 'file-banner', key: 'k-banner' },
      { id: 'file-1', key: 'k-1' },
    ]);
    const { service } = build({ findUnique, fileFindMany });

    const media = await service.getPublicMedia('47a7c6e9-c411-42c9-8b64-c30a410e9032');

    expect(media.avatarUrl).toBe('https://cdn/x');
    expect(media.bannerUrl).toBe('https://cdn/x');
    expect(media.portfolio).toEqual([
      { fileId: 'file-1', caption: 'Bathroom', url: 'https://cdn/x' },
    ]);
  });

  it('throws MasterNotFoundException when the master is not public', async () => {
    const { service } = build({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(
      service.getPublicMedia('47a7c6e9-c411-42c9-8b64-c30a410e9032'),
    ).rejects.toBeInstanceOf(MasterNotFoundException);
  });
});

describe('mintAvatarUrls', () => {
  it('leaves the stock avatar untouched and mints only real uploaded files', async () => {
    const items = [
      {
        displayName: 'Marcus Vance',
        avatarFileId: null,
        avatarUrl:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      },
      {
        displayName: 'Rustam Qodirov',
        avatarFileId: 'file-avatar',
        avatarUrl: null,
      },
    ] as never[];

    const fileFindMany = jest.fn().mockResolvedValue([{ id: 'file-avatar', key: 'k-avatar' }]);
    const { service } = build({ fileFindMany });

    const result = await service.mintAvatarUrls(items);

    expect(result[0]?.avatarUrl).toContain('images.unsplash.com');
    expect(result[1]?.avatarUrl).toBe('https://cdn/x');
    expect(fileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['file-avatar'] } }),
      }),
    );
  });
});
