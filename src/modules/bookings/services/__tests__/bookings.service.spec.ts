import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { BookingNotFoundException } from '../../exceptions/bookings.exceptions';
import { BookingsService } from '../bookings.service';

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }),
        ...overrides.clientProfile,
      },
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mp-1' }),
        ...overrides.masterProfile,
      },
      booking: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        ...overrides.booking,
      },
      bookingStatusHistory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  } as unknown as PrismaService;

  return { service: new BookingsService(prisma), prisma };
};

const detailRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'booking-1',
  masterProfile: { user: { id: 'master-user-1' }, displayName: 'Bob' },
  clientProfile: { user: { id: 'client-user-1' }, firstName: 'Alice', lastName: 'Smith' },
  ...overrides,
});

describe('BookingsService — reads', () => {
  it('findById throws BookingNotFoundException for an unknown id', async () => {
    const { service } = build({ booking: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.findById('missing')).rejects.toThrow(BookingNotFoundException);
  });

  it('findById returns the booking when it exists', async () => {
    const { service } = build({
      booking: { findUnique: jest.fn().mockResolvedValue(detailRow()) },
    });

    const booking = await service.findById('booking-1');

    expect(booking.id).toBe('booking-1');
  });

  it('findHistory reads the append-only trail in chronological order', async () => {
    const { service } = build();

    const history = await service.findHistory('booking-1');

    expect(history).toEqual([]);
  });

  it('getForCaller returns booking + history for a participant', async () => {
    const { service } = build({
      booking: { findUnique: jest.fn().mockResolvedValue(detailRow()) },
    });

    const result = await service.getForCaller({ id: 'client-user-1', role: 'CLIENT' }, 'booking-1');

    expect(result.booking.id).toBe('booking-1');
  });

  it('getForCaller throws BookingNotFoundException for a non-participant', async () => {
    const { service } = build({
      booking: { findUnique: jest.fn().mockResolvedValue(detailRow()) },
    });

    await expect(
      service.getForCaller({ id: 'stranger', role: 'CLIENT' }, 'booking-1'),
    ).rejects.toThrow(BookingNotFoundException);
  });

  it('getForCaller admits an admin regardless of participation', async () => {
    const { service } = build({
      booking: { findUnique: jest.fn().mockResolvedValue(detailRow()) },
    });

    const result = await service.getForCaller({ id: 'admin-1', role: 'ADMIN' }, 'booking-1');

    expect(result.booking.id).toBe('booking-1');
  });

  it('recordWhatsappClick stamps the link only once (P0)', async () => {
    let stamped = false;
    const findUnique = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(detailRow({ whatsappLinkClickedAt: stamped ? new Date() : null })),
      );
    const update = jest.fn().mockImplementation(() => {
      stamped = true;
      return Promise.resolve(detailRow({ whatsappLinkClickedAt: new Date() }));
    });
    const { service } = build({ booking: { findUnique, update } });

    await service.recordWhatsappClick('client-user-1', 'booking-1');
    await service.recordWhatsappClick('client-user-1', 'booking-1');

    expect(update).toHaveBeenCalledTimes(1);
    const query = firstArg<{ data: { whatsappLinkClickedAt?: Date } }>(update);
    expect(query.data.whatsappLinkClickedAt).toBeInstanceOf(Date);
  });

  it('recordWhatsappClick rejects a non-client of the booking (P0)', async () => {
    const { service } = build({
      booking: { findUnique: jest.fn().mockResolvedValue(detailRow()) },
    });

    await expect(service.recordWhatsappClick('stranger', 'booking-1')).rejects.toThrow(
      BookingNotFoundException,
    );
  });

  it('recordWhatsappClick reports BOOKING_NOT_FOUND for an unknown id (P0)', async () => {
    const { service } = build();

    await expect(service.recordWhatsappClick('client-user-1', 'ghost')).rejects.toThrow(
      BookingNotFoundException,
    );
  });

  it('listForClient resolves the caller’s clientProfileId and scopes the query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const { service } = build({ booking: { findMany, count } });

    await service.listForClient('user-1', { page: 1, limit: 20, skip: 0 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientProfileId: 'cp-1' }) }),
    );
  });

  it('listForClient throws when the caller has no client profile', async () => {
    const { service } = build({ clientProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.listForClient('user-1', { page: 1, limit: 20, skip: 0 })).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('listForMaster resolves the caller’s masterProfileId and scopes the query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const { service } = build({ booking: { findMany, count } });

    await service.listForMaster('user-1', { page: 1, limit: 20, skip: 0 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ masterProfileId: 'mp-1' }) }),
    );
  });

  it('listForMaster throws when the caller has no master profile', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.listForMaster('user-1', { page: 1, limit: 20, skip: 0 })).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('listForAdmin filters by masterId/clientId/status/date range when given', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const { service } = build({ booking: { findMany, count } });

    await service.listForAdmin({
      page: 1,
      limit: 20,
      skip: 0,
      masterId: 'mp-9',
      clientId: 'cp-9',
      status: 'PENDING',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          masterProfileId: 'mp-9',
          clientProfileId: 'cp-9',
          status: 'PENDING',
          scheduledAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
        }),
      }),
    );
  });

  it('listForAdmin with no filters queries unscoped', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const { service } = build({ booking: { findMany, count } });

    await service.listForAdmin({ page: 1, limit: 20, skip: 0 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
