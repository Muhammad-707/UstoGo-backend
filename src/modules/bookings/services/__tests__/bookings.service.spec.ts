import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { AvailabilityService } from '@modules/schedule/services/availability.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import type { CreateBookingDto } from '../../dto/requests/create-booking.dto';
import {
  BookingNotFoundException,
  ClientSlotConflictException,
  MasterUnavailableException,
  ServiceInvalidException,
  SlotNotAvailableException,
  SlotTooSoonException,
  TooManyPendingBookingsException,
} from '../../exceptions/bookings.exceptions';
import { BookingsService } from '../bookings.service';

const CLIENT_PROFILE = { id: 'cp-1', firstName: 'Alice' };
const MASTER = {
  id: 'mp-1',
  approvalStatus: 'APPROVED',
  isActive: true,
  timezone: 'UTC',
};
const SERVICE = {
  id: 'svc-1',
  masterProfileId: 'mp-1',
  isActive: true,
  durationMinutes: 60,
  title: 'Sink repair',
  price: { toFixed: () => '10.00' },
  priceType: 'FIXED',
  currency: 'USD',
};

const FUTURE = new Date(Date.now() + 3 * 60 * 60_000); // 3h ahead — clears the 2h lead time

const baseDto = (): CreateBookingDto => ({
  masterId: 'mp-1',
  serviceId: 'svc-1',
  scheduledAt: FUTURE.toISOString(),
  address: { line: '123 Main St', district: 'Downtown' },
});

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
    availableSlots?: Date[];
  } = {},
) => {
  const bookingCreateResult = {
    id: 'booking-1',
    scheduledAt: FUTURE,
    masterProfile: { user: { id: 'master-user-1' } },
    clientProfile: { firstName: 'Alice' },
  };

  const prisma = {
    db: {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue(CLIENT_PROFILE),
        ...overrides.clientProfile,
      },
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue(MASTER),
        ...overrides.masterProfile,
      },
      service: {
        findFirst: jest.fn().mockResolvedValue(SERVICE),
        ...overrides.service,
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        ...overrides.booking,
      },
      bookingStatusHistory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ nextval: 1n }]),
    },
  } as unknown as PrismaService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) =>
      fn({
        booking: { create: jest.fn().mockResolvedValue(bookingCreateResult) },
        bookingStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      }),
    ),
  } as unknown as TransactionManager;

  const availability = {
    compute: jest.fn().mockResolvedValue(overrides.availableSlots ?? [FUTURE]),
  } as unknown as AvailabilityService;

  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return {
    service: new BookingsService(prisma, transactionManager, availability, events),
    prisma,
    transactionManager,
    availability,
    events,
  };
};

describe('BookingsService.create', () => {
  it('throws MASTER_NOT_FOUND when the master does not exist', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.create('user-1', baseDto())).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws MasterUnavailableException when the master is not approved/active', async () => {
    const { service } = build({
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue({ ...MASTER, approvalStatus: 'PENDING' }),
      },
    });

    await expect(service.create('user-1', baseDto())).rejects.toThrow(MasterUnavailableException);
  });

  it('throws ServiceInvalidException when the service does not belong to the master or is inactive', async () => {
    const { service } = build({ service: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.create('user-1', baseDto())).rejects.toThrow(ServiceInvalidException);
  });

  it('throws SlotTooSoonException when scheduledAt is under 2 hours out', async () => {
    const { service } = build();
    const dto = { ...baseDto(), scheduledAt: new Date(Date.now() + 60_000).toISOString() };

    await expect(service.create('user-1', dto)).rejects.toThrow(SlotTooSoonException);
  });

  it('throws SlotNotAvailableException when the slot is not in computed availability', async () => {
    const { service } = build({ availableSlots: [] });

    await expect(service.create('user-1', baseDto())).rejects.toThrow(SlotNotAvailableException);
  });

  it('throws ClientSlotConflictException when the client has an overlapping open booking', async () => {
    const { service } = build({
      booking: { findFirst: jest.fn().mockResolvedValue({ id: 'other-booking' }) },
    });

    await expect(service.create('user-1', baseDto())).rejects.toThrow(ClientSlotConflictException);
  });

  it('throws TooManyPendingBookingsException at 5 open PENDING bookings', async () => {
    const { service } = build({ booking: { count: jest.fn().mockResolvedValue(5) } });

    await expect(service.create('user-1', baseDto())).rejects.toThrow(
      TooManyPendingBookingsException,
    );
  });

  it('creates the booking and emits BookingCreatedEvent once every pre-condition clears', async () => {
    const { service, transactionManager, events } = build();

    const booking = await service.create('user-1', baseDto());

    expect(booking.id).toBe('booking-1');
    expect(transactionManager.run).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('booking.created', expect.anything());
  });
});

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
