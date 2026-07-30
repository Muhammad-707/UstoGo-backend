import type { FilesService } from '@modules/files/services/files.service';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { BannerNotFoundException } from '../../exceptions/banners.exceptions';
import { BannersService } from '../banners.service';

const BANNER = {
  id: 'banner-1',
  title: 'Summer sale',
  subtitle: null,
  imageFileId: 'file-1',
  linkUrl: null,
  position: 'HOME_TOP',
  sortOrder: 0,
  startsAt: null,
  endsAt: null,
  isActive: true,
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

const build = (
  overrides: {
    banner?: Partial<Record<string, jest.Mock>>;
    files?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const bannerDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue(BANNER),
    update: jest.fn().mockResolvedValue(BANNER),
    ...overrides.banner,
  };
  const prisma = { db: { banner: bannerDelegate } } as unknown as PrismaService;
  const files = {
    getAttachable: jest.fn().mockResolvedValue({ id: 'file-1' }),
    softDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides.files,
  } as unknown as FilesService;

  return { service: new BannersService(prisma, files), bannerDelegate, files };
};

describe('BannersService.listPublic', () => {
  it('filters to active, in-window banners ordered by sortOrder', async () => {
    const { service, bannerDelegate } = build();

    await service.listPublic('HOME_TOP');

    expect(bannerDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ position: 'HOME_TOP', isActive: true }),
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        take: 50,
      }),
    );
  });

  it('omits the position filter when none is given', async () => {
    const { service, bannerDelegate } = build();

    await service.listPublic();

    const call = bannerDelegate.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('position');
  });
});

describe('BannersService.listForAdmin', () => {
  it('paginates without filtering out inactive banners', async () => {
    const { service, bannerDelegate } = build({
      banner: {
        findMany: jest.fn().mockResolvedValue([BANNER]),
        count: jest.fn().mockResolvedValue(1),
      },
    });

    const result = await service.listForAdmin(2, 10);

    expect(bannerDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result).toEqual({ items: [BANNER], total: 1 });
  });
});

describe('BannersService.getByIdForAdmin', () => {
  it('throws when the banner does not exist', async () => {
    const { service } = build();

    await expect(service.getByIdForAdmin('ghost')).rejects.toBeInstanceOf(BannerNotFoundException);
  });

  it('returns the banner when it exists', async () => {
    const { service } = build({ banner: { findUnique: jest.fn().mockResolvedValue(BANNER) } });

    await expect(service.getByIdForAdmin('banner-1')).resolves.toEqual(BANNER);
  });
});

describe('BannersService.create', () => {
  it('resolves the image via FilesService with purpose BANNER', async () => {
    const { service, files } = build();

    await service.create({ title: 'x', imageKey: 'file-1', position: 'HOME_TOP' }, 'admin-1');

    expect(files.getAttachable).toHaveBeenCalledWith('file-1', 'admin-1', 'BANNER');
  });

  it('stamps the caller as createdByUserId', async () => {
    const { service, bannerDelegate } = build();

    await service.create({ title: 'x', imageKey: 'file-1', position: 'HOME_TOP' }, 'admin-1');

    expect(bannerDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdByUserId: 'admin-1' }) }),
    );
  });
});

describe('BannersService.update', () => {
  it('throws when the banner does not exist', async () => {
    const { service } = build();

    await expect(service.update('ghost', {}, 'admin-1')).rejects.toBeInstanceOf(
      BannerNotFoundException,
    );
  });

  it('releases the previous image file when it is replaced', async () => {
    const { service, files } = build({
      banner: { findUnique: jest.fn().mockResolvedValue(BANNER) },
      files: { getAttachable: jest.fn().mockResolvedValue({ id: 'new-file' }) },
    });

    await service.update('banner-1', { imageKey: 'new-file' }, 'admin-1');

    expect(files.softDelete).toHaveBeenCalledWith('file-1');
  });

  it('leaves the image untouched when imageKey is not part of the request', async () => {
    const { service, files, bannerDelegate } = build({
      banner: { findUnique: jest.fn().mockResolvedValue(BANNER) },
    });

    await service.update('banner-1', { title: 'New title' }, 'admin-1');

    expect(files.getAttachable).not.toHaveBeenCalled();
    expect(files.softDelete).not.toHaveBeenCalled();
    expect(bannerDelegate.update).toHaveBeenCalledWith({
      where: { id: 'banner-1' },
      data: { title: 'New title' },
    });
  });
});

describe('BannersService.remove', () => {
  it('throws when the banner does not exist', async () => {
    const { service } = build();

    await expect(service.remove('ghost')).rejects.toBeInstanceOf(BannerNotFoundException);
  });

  it('soft-deletes the banner', async () => {
    const { service, bannerDelegate } = build({
      banner: { findUnique: jest.fn().mockResolvedValue(BANNER) },
    });

    await service.remove('banner-1');

    expect(bannerDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'banner-1' }, data: { deletedAt: expect.any(Date) } }),
    );
  });
});
