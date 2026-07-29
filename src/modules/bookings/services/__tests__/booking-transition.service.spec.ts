import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import {
  BookingNotFoundException,
  BookingOverlapException,
  IllegalBookingTransitionException,
  ReasonRequiredException,
  TooEarlyToStartException,
} from '../../exceptions/bookings.exceptions';
import { BookingTransitionService } from '../booking-transition.service';

const NOW = Date.now();

const bookingRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'booking-1',
  masterProfileId: 'mp-1',
  clientProfileId: 'cp-1',
  status: 'PENDING',
  scheduledAt: new Date(NOW + 3 * 60 * 60_000),
  endsAt: new Date(NOW + 4 * 60 * 60_000),
  ...overrides,
});

const detailRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  ...bookingRow(),
  masterProfile: { displayName: 'Bob the Builder', user: { id: 'master-user-1' } },
  clientProfile: { user: { id: 'client-user-1' } },
  ...overrides,
});

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    clientProfile?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const txBooking = {
    findUnique: jest.fn().mockResolvedValue(bookingRow()),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(detailRow()),
    ...overrides.booking,
  };

  const tx = {
    booking: txBooking,
    bookingStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    masterProfile: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    db: {
      masterProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mp-1' }),
        ...overrides.masterProfile,
      },
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }),
        ...overrides.clientProfile,
      },
    },
  } as unknown as PrismaService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as TransactionManager;

  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return {
    service: new BookingTransitionService(prisma, transactionManager, events),
    tx,
    events,
  };
};

describe('BookingTransitionService', () => {
  describe('accept', () => {
    it('accepts a PENDING booking owned by the caller', async () => {
      const { service, events } = build();

      const result = await service.accept('master-user-1', 'booking-1');

      expect(result.status).toBeDefined();
      expect(events.emit).toHaveBeenCalledWith('booking.accepted', expect.anything());
    });

    it('throws BookingNotFoundException when the booking belongs to another master', async () => {
      const { service } = build({
        booking: {
          findUnique: jest.fn().mockResolvedValue(bookingRow({ masterProfileId: 'other-mp' })),
        },
      });

      await expect(service.accept('master-user-1', 'booking-1')).rejects.toThrow(
        BookingNotFoundException,
      );
    });

    it('throws IllegalBookingTransitionException from a non-PENDING status', async () => {
      const { service } = build({
        booking: { findUnique: jest.fn().mockResolvedValue(bookingRow({ status: 'COMPLETED' })) },
      });

      await expect(service.accept('master-user-1', 'booking-1')).rejects.toThrow(
        IllegalBookingTransitionException,
      );
    });

    it('throws BookingOverlapException when another ACCEPTED booking already occupies the slot', async () => {
      const { service } = build({
        booking: {
          findUnique: jest.fn().mockResolvedValue(bookingRow()),
          findFirst: jest.fn().mockResolvedValue({ id: 'overlap-1' }),
        },
      });

      await expect(service.accept('master-user-1', 'booking-1')).rejects.toThrow(
        BookingOverlapException,
      );
    });
  });

  describe('reject', () => {
    it('rejects a PENDING booking with a reason', async () => {
      const { service, events } = build();

      await service.reject('master-user-1', 'booking-1', 'Not available that day');

      expect(events.emit).toHaveBeenCalledWith('booking.rejected', expect.anything());
    });
  });

  describe('cancel', () => {
    it('lets a client cancel without a reason', async () => {
      const { service, events } = build();

      await service.cancel({ userId: 'client-user-1', role: 'CLIENT' }, 'booking-1', undefined);

      expect(events.emit).toHaveBeenCalledWith('booking.cancelled', expect.anything());
    });

    it('requires a reason from the master', async () => {
      const { service } = build();

      await expect(
        service.cancel({ userId: 'master-user-1', role: 'MASTER' }, 'booking-1', undefined),
      ).rejects.toThrow(ReasonRequiredException);
    });

    it('throws BookingNotFoundException when the caller does not own the booking', async () => {
      const { service } = build({
        clientProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'other-cp' }) },
      });

      await expect(
        service.cancel({ userId: 'client-user-1', role: 'CLIENT' }, 'booking-1', undefined),
      ).rejects.toThrow(BookingNotFoundException);
    });

    it('marks a cancellation inside the late window as isLateCancellation', async () => {
      const soon = bookingRow({
        status: 'ACCEPTED',
        scheduledAt: new Date(NOW + 60 * 60_000),
        endsAt: new Date(NOW + 2 * 60 * 60_000),
      });
      const { service, tx } = build({ booking: { findUnique: jest.fn().mockResolvedValue(soon) } });

      await service.cancel({ userId: 'client-user-1', role: 'CLIENT' }, 'booking-1', undefined);

      expect(tx.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isLateCancellation: true }) }),
      );
    });
  });

  describe('start', () => {
    it('throws TooEarlyToStartException more than 30 minutes before the slot', async () => {
      const accepted = bookingRow({
        status: 'ACCEPTED',
        scheduledAt: new Date(NOW + 3 * 60 * 60_000),
      });
      const { service } = build({ booking: { findUnique: jest.fn().mockResolvedValue(accepted) } });

      await expect(service.start('master-user-1', 'booking-1')).rejects.toThrow(
        TooEarlyToStartException,
      );
    });

    it('starts within 30 minutes of the slot', async () => {
      const accepted = bookingRow({ status: 'ACCEPTED', scheduledAt: new Date(NOW + 10 * 60_000) });
      const { service, events } = build({
        booking: { findUnique: jest.fn().mockResolvedValue(accepted) },
      });

      await service.start('master-user-1', 'booking-1');

      expect(events.emit).toHaveBeenCalledWith('booking.started', expect.anything());
    });
  });

  describe('complete', () => {
    it('completes an IN_PROGRESS booking and increments completedBookingsCount', async () => {
      const inProgress = bookingRow({ status: 'IN_PROGRESS' });
      const { service, tx, events } = build({
        booking: { findUnique: jest.fn().mockResolvedValue(inProgress) },
      });

      await service.complete('master-user-1', 'booking-1');

      expect(tx.masterProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { completedBookingsCount: { increment: 1 } } }),
      );
      expect(events.emit).toHaveBeenCalledWith('booking.completed', expect.anything());
    });
  });
});
