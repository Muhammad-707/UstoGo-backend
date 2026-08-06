import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { AvailabilityService } from '@modules/schedule/services/availability.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import type { CreateBookingDto } from '../../dto/requests/create-booking.dto';
import {
  ClientSlotConflictException,
  MasterUnavailableException,
  ServiceInvalidException,
  SlotNotAvailableException,
  SlotTooSoonException,
  TooManyPendingBookingsException,
} from '../../exceptions/bookings.exceptions';
import type { BookingAttachmentsService } from '../booking-attachments.service';
import { BookingCreationService } from '../booking-creation.service';

const CLIENT_PROFILE = { id: 'cp-1', firstName: 'Alice' };
const MASTER = {
  id: 'mp-1',
  approvalStatus: 'APPROVED',
  isActive: true,
  timezone: 'UTC',
  instantBookEnabled: false,
  reliabilityScore: null,
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
  address: { cityId: 'city-1', line: '123 Main St', district: 'Downtown' },
});

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    masterProfile?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
    availableSlots?: Date[];
    masterOverrides?: Partial<Record<string, unknown>>;
  } = {},
) => {
  const bookingCreateResult = {
    id: 'booking-1',
    scheduledAt: FUTURE,
    masterProfile: { user: { id: 'master-user-1' }, displayName: 'Bob' },
    clientProfile: { firstName: 'Alice', user: { id: 'client-user-1' } },
  };

  const prisma = {
    db: {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue(CLIENT_PROFILE),
        ...overrides.clientProfile,
      },
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...MASTER, ...(overrides.masterOverrides ?? {}) }),
        ...overrides.masterProfile,
      },
      service: {
        findFirst: jest.fn().mockResolvedValue(SERVICE),
        ...overrides.service,
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        ...overrides.booking,
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

  const attachments = {
    assertOwned: jest.fn().mockResolvedValue([]),
  } as unknown as BookingAttachmentsService;

  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return {
    service: new BookingCreationService(
      prisma,
      transactionManager,
      availability,
      attachments,
      events,
    ),
    prisma,
    transactionManager,
    availability,
    events,
  };
};

describe('BookingCreationService.create', () => {
  it('throws MASTER_NOT_FOUND when the master does not exist', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.create('user-1', baseDto())).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws MasterUnavailableException when the master is not approved/active', async () => {
    const { service } = build({ masterOverrides: { approvalStatus: 'PENDING' } });

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

  it('creates a PENDING booking and emits only BookingCreatedEvent when the master is not instant-book eligible', async () => {
    const { service, transactionManager, events } = build();

    const booking = await service.create('user-1', baseDto());

    expect(booking.id).toBe('booking-1');
    expect(transactionManager.run).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('booking.created', expect.anything());
    expect(events.emit).not.toHaveBeenCalledWith('booking.accepted', expect.anything());
  });

  it('B-24: auto-accepts and emits both events for an opted-in, high-reliability master', async () => {
    const { service, events } = build({
      masterOverrides: { instantBookEnabled: true, reliabilityScore: { toFixed: () => '95.00' } },
    });
    // reliabilityScore is read via Number(...), so a plain number works too.
    const { service: service2, events: events2 } = build({
      masterOverrides: { instantBookEnabled: true, reliabilityScore: 95 },
    });
    void service;
    void events;

    await service2.create('user-1', baseDto());

    expect(events2.emit).toHaveBeenCalledWith('booking.created', expect.anything());
    expect(events2.emit).toHaveBeenCalledWith('booking.accepted', expect.anything());
  });

  it('does not instant-book a master below the reliability threshold', async () => {
    const { service, events } = build({
      masterOverrides: { instantBookEnabled: true, reliabilityScore: 50 },
    });

    await service.create('user-1', baseDto());

    expect(events.emit).not.toHaveBeenCalledWith('booking.accepted', expect.anything());
  });
});
