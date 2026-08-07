import type { PrismaService } from '@prisma-lib/prisma.service';

import { ProductNotFoundException } from '../../exceptions/marketplace.exceptions';
import { ProductLikesService } from '../product-likes.service';

const build = (
  overrides: {
    clientProfile?: Record<string, unknown> | null;
    product?: Record<string, unknown> | null;
  } = {},
) => {
  const clientProfile =
    overrides.clientProfile === undefined ? { id: 'cp-1' } : overrides.clientProfile;

  const upsert = jest.fn().mockResolvedValue({ id: 'like-1' });
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const findMany = jest.fn().mockResolvedValue([{ product: { id: 'prod-1', images: [] } }]);

  const prisma = {
    db: {
      clientProfile: { findUnique: jest.fn().mockResolvedValue(clientProfile) },
      product: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            overrides.product === undefined ? { id: 'prod-1' } : overrides.product,
          ),
      },
      productLike: { upsert, deleteMany, findMany },
    },
  } as unknown as PrismaService;

  return { service: new ProductLikesService(prisma), prisma, upsert, deleteMany, findMany };
};

describe('ProductLikesService.list', () => {
  it('unwraps the joined product off each like row', async () => {
    const { service } = build();

    const result = await service.list('user-1');

    expect(result).toEqual([{ id: 'prod-1', images: [] }]);
  });
});

describe('ProductLikesService.add', () => {
  it('throws ProductNotFoundException for an inactive/unknown product', async () => {
    const { service } = build({ product: null });

    await expect(service.add('user-1', 'prod-1')).rejects.toThrow(ProductNotFoundException);
  });

  it('upserts idempotently — an existing like is a no-op update', async () => {
    const { service, upsert } = build();

    await service.add('user-1', 'prod-1');

    expect(upsert).toHaveBeenCalledWith({
      where: { clientProfileId_productId: { clientProfileId: 'cp-1', productId: 'prod-1' } },
      update: {},
      create: { clientProfileId: 'cp-1', productId: 'prod-1' },
    });
  });
});

describe('ProductLikesService.remove', () => {
  it('is idempotent — deleteMany never throws for a non-liked product', async () => {
    const { service, deleteMany } = build();

    await service.remove('user-1', 'prod-1');

    expect(deleteMany).toHaveBeenCalledWith({
      where: { clientProfileId: 'cp-1', productId: 'prod-1' },
    });
  });
});
