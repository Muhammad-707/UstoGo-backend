import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import { ProductNotFoundException } from '../../exceptions/marketplace.exceptions';
import type { ProductCategoriesService } from '../product-categories.service';
import { ProductsService } from '../products.service';

const build = (
  overrides: { categoryExists?: boolean; product?: Record<string, unknown> | null } = {},
) => {
  const categoryExists = overrides.categoryExists ?? true;
  const categories = {
    findByIdOrThrow: jest.fn().mockImplementation(() => {
      if (!categoryExists) {
        throw new Error('CATEGORY_NOT_FOUND');
      }
      return Promise.resolve({ id: 'cat-1' });
    }),
  } as unknown as ProductCategoriesService;

  const productCreate = jest.fn().mockResolvedValue({ id: 'prod-1' });
  const productUpdate = jest.fn().mockResolvedValue({ id: 'prod-1' });
  const imageDeleteMany = jest.fn().mockResolvedValue({ count: 2 });

  const prisma = {
    db: {
      product: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            overrides.product === undefined ? { id: 'prod-1' } : overrides.product,
          ),
        findUnique: jest
          .fn()
          .mockResolvedValue(
            overrides.product === undefined ? { id: 'prod-1' } : overrides.product,
          ),
      },
    },
  } as unknown as PrismaService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({
        product: { create: productCreate, update: productUpdate },
        productImage: { deleteMany: imageDeleteMany },
      }),
    ),
  } as unknown as TransactionManager;

  const config = { catalogue: { currency: 'TJS' } } as unknown as AppConfigService;

  return {
    service: new ProductsService(prisma, categories, transactionManager, config),
    productCreate,
    productUpdate,
    imageDeleteMany,
  };
};

describe('ProductsService.create', () => {
  it('rejects an unknown category before writing anything', async () => {
    const { service, productCreate } = build({ categoryExists: false });

    await expect(
      service.create({
        categoryId: 'cat-x',
        name: 'Cement',
        description: 'Portland cement, 50kg bag',
        price: 45,
        imageUrls: ['https://example.com/a.jpg'],
      }),
    ).rejects.toThrow();
    expect(productCreate).not.toHaveBeenCalled();
  });

  it('stamps the deployment currency and creates ordered images', async () => {
    const { service, productCreate } = build();

    await service.create({
      categoryId: 'cat-1',
      name: 'Cement',
      description: 'Portland cement, 50kg bag',
      price: 45,
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });

    expect(productCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currency: 'TJS',
          images: {
            create: [
              { imageUrl: 'https://example.com/a.jpg', sortOrder: 0 },
              { imageUrl: 'https://example.com/b.jpg', sortOrder: 1 },
            ],
          },
        }),
      }),
    );
  });
});

describe('ProductsService.update', () => {
  it('replaces the full image set atomically when imageUrls is given', async () => {
    const { service, imageDeleteMany, productUpdate } = build();

    await service.update('prod-1', { imageUrls: ['https://example.com/new.jpg'] });

    expect(imageDeleteMany).toHaveBeenCalledWith({ where: { productId: 'prod-1' } });
    expect(productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          images: { create: [{ imageUrl: 'https://example.com/new.jpg', sortOrder: 0 }] },
        }),
      }),
    );
  });

  it('leaves images untouched when imageUrls is omitted', async () => {
    const { service, imageDeleteMany, productUpdate } = build();

    await service.update('prod-1', { name: 'Renamed' });

    expect(imageDeleteMany).not.toHaveBeenCalled();
    expect(productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Renamed' }) }),
    );
  });
});

describe('ProductsService.getPublicById', () => {
  it('throws ProductNotFoundException for an inactive/unknown product', async () => {
    const { service } = build({ product: null });

    await expect(service.getPublicById('prod-1')).rejects.toThrow(ProductNotFoundException);
  });
});
