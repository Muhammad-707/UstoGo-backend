import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  OrderAlreadyCancelledException,
  OrderNotFoundException,
} from '../../exceptions/marketplace.exceptions';
import { OrdersService } from '../orders.service';

const build = (overrides: { order?: Record<string, unknown> | null } = {}) => {
  const order =
    overrides.order === undefined
      ? { id: 'order-1', status: 'PAID', clientProfileId: 'cp-1' }
      : overrides.order;

  const orderUpdate = jest.fn().mockResolvedValue({ ...order, status: 'CANCELLED' });

  const prisma = {
    db: {
      clientProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }) },
      order: { findUnique: jest.fn().mockResolvedValue(order), update: orderUpdate },
    },
  } as unknown as PrismaService;

  return { service: new OrdersService(prisma), orderUpdate };
};

describe('OrdersService.cancel', () => {
  it('throws OrderNotFoundException for an unknown order', async () => {
    const { service } = build({ order: null });

    await expect(service.cancel('order-x')).rejects.toThrow(OrderNotFoundException);
  });

  it('throws OrderAlreadyCancelledException for an already-cancelled order', async () => {
    const { service } = build({ order: { id: 'order-1', status: 'CANCELLED' } });

    await expect(service.cancel('order-1')).rejects.toThrow(OrderAlreadyCancelledException);
  });

  it('cancels a PAID order', async () => {
    const { service, orderUpdate } = build();

    await service.cancel('order-1');

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED' } }),
    );
  });
});

describe('OrdersService.getForClient', () => {
  it('throws OrderNotFoundException for a foreign order (never 403)', async () => {
    const { service } = build({
      order: { id: 'order-1', status: 'PAID', clientProfileId: 'someone-else' },
    });

    await expect(service.getForClient('user-1', 'order-1')).rejects.toThrow(OrderNotFoundException);
  });
});
