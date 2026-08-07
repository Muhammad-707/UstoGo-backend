import type { PrismaService } from '@prisma-lib/prisma.service';

import { ProductCategoryNotFoundException } from '../../exceptions/marketplace.exceptions';
import { ProductCategoriesService } from '../product-categories.service';

const build = (overrides: { category?: Record<string, unknown> | null } = {}) => {
  const findUnique = jest
    .fn()
    .mockResolvedValue(overrides.category === undefined ? { id: 'cat-1' } : overrides.category);
  const update = jest.fn().mockResolvedValue({ id: 'cat-1' });
  const create = jest.fn().mockResolvedValue({ id: 'cat-1' });

  const prisma = {
    db: {
      productCategory: {
        findUnique,
        findMany: jest.fn().mockResolvedValue([]),
        create,
        update,
      },
    },
  } as unknown as PrismaService;

  return { service: new ProductCategoriesService(prisma), prisma, findUnique, update, create };
};

describe('ProductCategoriesService.listPublic', () => {
  it('filters to active categories only', async () => {
    const { service, prisma } = build();

    await service.listPublic();

    expect(prisma.db.productCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });
});

describe('ProductCategoriesService.listForAdmin', () => {
  it('does not filter by isActive', async () => {
    const { service, prisma } = build();

    await service.listForAdmin();

    const call = (prisma.db.productCategory.findMany as jest.Mock).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(call).not.toHaveProperty('where');
  });
});

describe('ProductCategoriesService.create', () => {
  it('omits sortOrder/isActive from the write when not given', async () => {
    const { service, create } = build();

    await service.create({ name: 'Paint', slug: 'paint' });

    expect(create).toHaveBeenCalledWith({ data: { name: 'Paint', slug: 'paint' } });
  });

  it('includes sortOrder/isActive when given', async () => {
    const { service, create } = build();

    await service.create({ name: 'Paint', slug: 'paint', sortOrder: 3, isActive: false });

    expect(create).toHaveBeenCalledWith({
      data: { name: 'Paint', slug: 'paint', sortOrder: 3, isActive: false },
    });
  });
});

describe('ProductCategoriesService.update', () => {
  it('throws ProductCategoryNotFoundException for an unknown id', async () => {
    const { service } = build({ category: null });

    await expect(service.update('cat-x', { name: 'Renamed' })).rejects.toThrow(
      ProductCategoryNotFoundException,
    );
  });

  it('only writes the fields given', async () => {
    const { service, update } = build();

    await service.update('cat-1', { isActive: false });

    expect(update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data: { isActive: false } });
  });
});

describe('ProductCategoriesService.remove', () => {
  it('throws ProductCategoryNotFoundException for an unknown id', async () => {
    const { service } = build({ category: null });

    await expect(service.remove('cat-x')).rejects.toThrow(ProductCategoryNotFoundException);
  });

  it('soft-deletes and deactivates in one write', async () => {
    const { service, update } = build();

    await service.remove('cat-1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cat-1' },
        data: expect.objectContaining({ isActive: false }),
      }),
    );
    const call = update.mock.calls[0][0] as { data: { deletedAt: Date } };
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });
});

describe('ProductCategoriesService.findByIdOrThrow', () => {
  it('throws ProductCategoryNotFoundException for an unknown id', async () => {
    const { service } = build({ category: null });

    await expect(service.findByIdOrThrow('cat-x')).rejects.toThrow(
      ProductCategoryNotFoundException,
    );
  });

  it('returns the category when found', async () => {
    const { service } = build({ category: { id: 'cat-1' } });

    await expect(service.findByIdOrThrow('cat-1')).resolves.toEqual({ id: 'cat-1' });
  });
});
