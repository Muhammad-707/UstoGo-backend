import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import { CartEmptyException } from '../../exceptions/marketplace.exceptions';
import { CheckoutService } from '../checkout.service';

const price = (value: number) => ({
  toNumber: () => value,
  toFixed: (n: number) => value.toFixed(n),
});

const cartLine = (overrides: Partial<Record<string, unknown>> = {}) => ({
  productId: 'prod-1',
  quantity: 2,
  product: { id: 'prod-1', name: 'Cement 50kg', price: price(45) },
  ...overrides,
});

const build = (overrides: { cartItems?: unknown[] } = {}) => {
  const cartItems = overrides.cartItems ?? [cartLine()];

  const orderCreate = jest.fn().mockImplementation(({ data }) => ({
    id: 'order-1',
    clientProfileId: data.clientProfileId,
    totalAmount: data.totalAmount,
    currency: data.currency,
    items: data.items.create,
  }));
  const cartItemDeleteMany = jest.fn().mockResolvedValue({ count: cartItems.length });

  const prisma = {
    db: {
      clientProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }) },
      cartItem: { findMany: jest.fn().mockResolvedValue(cartItems) },
    },
  } as unknown as PrismaService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({ order: { create: orderCreate }, cartItem: { deleteMany: cartItemDeleteMany } }),
    ),
  } as unknown as TransactionManager;

  const config = { catalogue: { currency: 'TJS' } } as unknown as AppConfigService;

  return {
    service: new CheckoutService(prisma, transactionManager, config),
    orderCreate,
    cartItemDeleteMany,
  };
};

describe('CheckoutService.checkout', () => {
  it('throws CartEmptyException when the cart has no available lines', async () => {
    const { service } = build({ cartItems: [] });

    await expect(service.checkout('user-1')).rejects.toThrow(CartEmptyException);
  });

  it('computes the total from every line’s price × quantity', async () => {
    const { service, orderCreate } = build({
      cartItems: [
        cartLine({
          productId: 'prod-1',
          quantity: 2,
          product: { name: 'Cement', price: price(45) },
        }),
        cartLine({
          productId: 'prod-2',
          quantity: 3,
          product: { name: 'Paint', price: price(20) },
        }),
      ],
    });

    await service.checkout('user-1');

    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalAmount: 150, currency: 'TJS' }),
      }),
    );
  });

  it('clears exactly the checked-out lines from the cart', async () => {
    const { service, cartItemDeleteMany } = build();

    await service.checkout('user-1');

    expect(cartItemDeleteMany).toHaveBeenCalledWith({
      where: { clientProfileId: 'cp-1', productId: { in: ['prod-1'] } },
    });
  });
});
