import type { AvailabilityService } from '@modules/schedule/services/availability.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import {
  BookingNotFoundException,
  BookingOverlapException,
  ClientSlotConflictException,
  IllegalBookingTransitionException,
  RescheduleLimitExceededException,
  RescheduleWindowClosedException,
  SlotNotAvailableException,
  SlotTooSoonException,
} from '../../exceptions/bookings.exceptions';
import { BookingRescheduleService } from '../booking-reschedule.service';
import type { BookingsService } from '../bookings.service';

const NOW = Date.now();
const HOUR = 60 * 60_000;

// >=24h out, clears RESCHEDULE_WINDOW_CLOSED.
const CURRENT_SLOT = new Date(NOW + 48 * HOUR);
// >=2h out, clears SLOT_TOO_SOON, and distinct from CURRENT_SLOT.
const NEW_SLOT = new Date(NOW + 72 * HOUR);

const detailRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'booking-1',
  masterProfileId: 'mp-1',
  clientProfileId: 'cp-1',
  serviceId: 'svc-1',
  status: 'PENDING',
  scheduledAt: CURRENT_SLOT,
  endsAt: new Date(CURRENT_SLOT.getTime() + 60 * 60_000),
  durationMinutes: 60,
  rescheduleCount: 0,
  masterProfile: { user: { id: 'master-user-1' } },
  clientProfile: { user: { id: 'client-user-1' } },
  ...overrides,
});

const build = (
  overrides: {
    booking?: Partial<Record<string, unknown>>;
    txBooking?: Partial<Record<string, jest.Mock>>;
    availableSlots?: Date[];
  } = {},
) => {
  const booking = detailRow(overrides.booking);

  const txBooking = {
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ ...booking, scheduledAt: NEW_SLOT, rescheduleCount: 1 }),
    ...overrides.txBooking,
  };

  const prisma = {
    db: {
      masterProfile: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      booking: { findFirst: jest.fn().mockResolvedValue(null) },
    },
  } as unknown as PrismaService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn({ booking: txBooking })),
  } as unknown as TransactionManager;

  const availability = {
    compute: jest.fn().mockResolvedValue(overrides.availableSlots ?? [NEW_SLOT]),
  } as unknown as AvailabilityService;

  const bookings = {
    findById: jest.fn().mockResolvedValue(booking),
  } as unknown as BookingsService;

  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return {
    service: new BookingRescheduleService(
      prisma,
      transactionManager,
      availability,
      bookings,
      events,
    ),
    prisma,
    txBooking,
    availability,
    events,
  };
};

describe('BookingRescheduleService.reschedule', () => {
  it('throws BookingNotFoundException for a non-owning caller', async () => {
    const { service } = build();

    await expect(
      service.reschedule('stranger', 'booking-1', { scheduledAt: NEW_SLOT.toISOString() }),
    ).rejects.toThrow(BookingNotFoundException);
  });

  it('throws IllegalBookingTransitionException for a non-PENDING/ACCEPTED booking', async () => {
    const { service } = build({ booking: { status: 'COMPLETED' } });

    await expect(
      service.reschedule('client-user-1', 'booking-1', { scheduledAt: NEW_SLOT.toISOString() }),
    ).rejects.toThrow(IllegalBookingTransitionException);
  });

  it('throws RescheduleLimitExceededException when already rescheduled once', async () => {
    const { service } = build({ booking: { rescheduleCount: 1 } });

    await expect(
      service.reschedule('client-user-1', 'booking-1', { scheduledAt: NEW_SLOT.toISOString() }),
    ).rejects.toThrow(RescheduleLimitExceededException);
  });

  it('throws RescheduleWindowClosedException when the current slot is under 24h away', async () => {
    const { service } = build({ booking: { scheduledAt: new Date(NOW + 2 * HOUR) } });

    await expect(
      service.reschedule('client-user-1', 'booking-1', { scheduledAt: NEW_SLOT.toISOString() }),
    ).rejects.toThrow(RescheduleWindowClosedException);
  });

  it('throws SlotTooSoonException when the new slot is under 2h away', async () => {
    const { service } = build();
    const tooSoon = new Date(NOW + 60_000).toISOString();

    await expect(
      service.reschedule('client-user-1', 'booking-1', { scheduledAt: tooSoon }),
    ).rejects.toThrow(SlotTooSoonException);
  });

  it('throws SlotNotAvailableException when the new slot is not in computed availability', async () => {
    const { service } = build({ availableSlots: [] });

    await expect(
      service.reschedule('client-user-1', 'booking-1', { scheduledAt: NEW_SLOT.toISOString() }),
    ).rejects.toThrow(SlotNotAvailableException);
  });

  it('throws ClientSlotConflictException when the client has another overlapping booking', async () => {
    const { service, prisma } = build();
    (prisma.db.booking.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'other-booking' });

    await expect(
      service.reschedule('client-user-1', 'booking-1', { scheduledAt: NEW_SLOT.toISOString() }),
    ).rejects.toThrow(ClientSlotConflictException);
  });

  it('throws BookingOverlapException when the master has an overlapping ACCEPTED/IN_PROGRESS booking', async () => {
    const { service } = build({
      txBooking: { findFirst: jest.fn().mockResolvedValue({ id: 'other-booking' }) },
    });

    await expect(
      service.reschedule('client-user-1', 'booking-1', { scheduledAt: NEW_SLOT.toISOString() }),
    ).rejects.toThrow(BookingOverlapException);
  });

  it('reschedules once every pre-condition clears, incrementing rescheduleCount and emitting the event', async () => {
    const { service, txBooking, events } = build();

    const result = await service.reschedule('client-user-1', 'booking-1', {
      scheduledAt: NEW_SLOT.toISOString(),
    });

    expect(result.rescheduleCount).toBe(1);
    expect(txBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rescheduleCount: { increment: 1 } }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith('booking.rescheduled', expect.anything());
  });
});
