import type { PrismaService } from '@prisma-lib/prisma.service';

import { MAX_ITEM_QUANTITY } from '../../constants/marketplace.constants';
import {
  CartItemNotFoundException,
  ProductNotFoundException,
} from '../../exceptions/marketplace.exceptions';
import { CartService } from '../cart.service';

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, unknown>> | null;
    product?: Partial<Record<string, unknown>> | null;
    existingCartItem?: Partial<Record<string, unknown>> | null;
  } = {},
) => {
  const clientProfile =
    overrides.clientProfile === undefined ? { id: 'cp-1' } : overrides.clientProfile;

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
      cartItem: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            overrides.existingCartItem === undefined ? null : overrides.existingCartItem,
          ),
        upsert: jest.fn().mockImplementation(({ create, update }) => ({ ...create, ...update })),
        update: jest.fn().mockResolvedValue({ productId: 'prod-1', quantity: 5 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  } as unknown as PrismaService;

  return { service: new CartService(prisma), prisma };
};

describe('CartService.addItem', () => {
  it('throws ProductNotFoundException for an inactive/unknown product', async () => {
    const { service } = build({ product: null });

    await expect(service.addItem('user-1', 'prod-1', 1)).rejects.toThrow(ProductNotFoundException);
  });

  it('creates a new line at the requested quantity', async () => {
    const { service, prisma } = build();

    await service.addItem('user-1', 'prod-1', 3);

    expect(prisma.db.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { clientProfileId: 'cp-1', productId: 'prod-1', quantity: 3 },
      }),
    );
  });

  it('increments an existing line rather than replacing it', async () => {
    const { service, prisma } = build({ existingCartItem: { quantity: 4 } });

    await service.addItem('user-1', 'prod-1', 3);

    expect(prisma.db.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { quantity: 7 } }),
    );
  });

  it('caps the resulting quantity at the maximum', async () => {
    const { service, prisma } = build({ existingCartItem: { quantity: MAX_ITEM_QUANTITY - 1 } });

    await service.addItem('user-1', 'prod-1', 10);

    expect(prisma.db.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { quantity: MAX_ITEM_QUANTITY } }),
    );
  });
});

describe('CartService.setQuantity', () => {
  it('throws CartItemNotFoundException when the line does not exist', async () => {
    const { service } = build();

    await expect(service.setQuantity('user-1', 'prod-1', 2)).rejects.toThrow(
      CartItemNotFoundException,
    );
  });

  it('updates the line to the exact quantity given', async () => {
    const { service, prisma } = build({ existingCartItem: { id: 'ci-1' } });

    await service.setQuantity('user-1', 'prod-1', 5);

    expect(prisma.db.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 5 } }),
    );
  });
});

describe('CartService.removeItem', () => {
  it('is idempotent — deleteMany never throws for an absent line', async () => {
    const { service, prisma } = build();

    await service.removeItem('user-1', 'prod-1');

    expect(prisma.db.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { clientProfileId: 'cp-1', productId: 'prod-1' },
    });
  });
});
