import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { MasterNotFoundException } from '@modules/masters/exceptions/masters.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { FavoritesService } from '../favorites.service';

const CLIENT_PROFILE = { id: 'cp-1', userId: 'user-1' };

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
    favorite?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const clientProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue(CLIENT_PROFILE),
    ...overrides.clientProfile,
  };
  const masterProfileDelegate = {
    findFirst: jest.fn().mockResolvedValue({ id: 'mp-1' }),
    ...overrides.masterProfile,
  };
  const favoriteDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides.favorite,
  };
  const prisma = {
    db: {
      clientProfile: clientProfileDelegate,
      masterProfile: masterProfileDelegate,
      favorite: favoriteDelegate,
    },
  } as unknown as PrismaService;

  return {
    service: new FavoritesService(prisma),
    clientProfileDelegate,
    masterProfileDelegate,
    favoriteDelegate,
  };
};

describe('FavoritesService', () => {
  it('rejects a caller with no client profile', async () => {
    const { service } = build({
      clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.list('user-1')).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('rejects favoriting a master that is not public', async () => {
    const { service } = build({ masterProfile: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.add('user-1', 'mp-1')).rejects.toBeInstanceOf(MasterNotFoundException);
  });

  it('upserts on add, scoped to the client profile', async () => {
    const { service, favoriteDelegate } = build();

    await service.add('user-1', 'mp-1');

    expect(favoriteDelegate.upsert).toHaveBeenCalledWith({
      where: {
        clientProfileId_masterProfileId: { clientProfileId: 'cp-1', masterProfileId: 'mp-1' },
      },
      update: {},
      create: { clientProfileId: 'cp-1', masterProfileId: 'mp-1' },
    });
  });

  it('removes without error when the master was never favorited', async () => {
    const { service, favoriteDelegate } = build({
      favorite: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });

    await expect(service.remove('user-1', 'mp-1')).resolves.toBeUndefined();
    expect(favoriteDelegate.deleteMany).toHaveBeenCalledWith({
      where: { clientProfileId: 'cp-1', masterProfileId: 'mp-1' },
    });
  });

  it('lists favorites newest-first', async () => {
    const { service, favoriteDelegate } = build();

    await service.list('user-1');

    expect(favoriteDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientProfileId: 'cp-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});
