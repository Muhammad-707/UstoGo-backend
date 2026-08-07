import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  BookingNotFoundException,
  PaymentAlreadyConfirmedException,
  PaymentNoteRequiredException,
} from '../../exceptions/bookings.exceptions';
import { BookingPaymentService } from '../booking-payment.service';
import type { BookingsService } from '../bookings.service';

const price = (value: number) => ({
  toNumber: () => value,
  toFixed: (n: number) => value.toFixed(n),
});

const detailRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'booking-1',
  status: 'COMPLETED',
  price: price(50),
  currency: 'TJS',
  paymentConfirmedAt: null,
  masterProfile: { user: { id: 'master-user-1' } },
  clientProfile: { user: { id: 'client-user-1' } },
  ...overrides,
});

const build = (overrides: { booking?: Partial<Record<string, unknown>> } = {}) => {
  const booking = detailRow(overrides.booking);

  const prisma = {
    db: { booking: { update: jest.fn().mockResolvedValue(booking) } },
  } as unknown as PrismaService;

  const bookings = { findById: jest.fn().mockResolvedValue(booking) } as unknown as BookingsService;
  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return { service: new BookingPaymentService(prisma, bookings, events), prisma, events };
};

describe('BookingPaymentService.confirm', () => {
  it('throws BookingNotFoundException for a non-owning caller', async () => {
    const { service } = build();

    await expect(service.confirm('stranger', 'booking-1', { paidAmount: 50 })).rejects.toThrow(
      BookingNotFoundException,
    );
  });

  it('throws BOOKING_NOT_COMPLETED for a non-COMPLETED booking', async () => {
    const { service } = build({ booking: { status: 'IN_PROGRESS' } });

    await expect(
      service.confirm('client-user-1', 'booking-1', { paidAmount: 50 }),
    ).rejects.toMatchObject({ code: 'BOOKING_NOT_COMPLETED' });
  });

  it('throws PaymentAlreadyConfirmedException once already confirmed', async () => {
    const { service } = build({ booking: { paymentConfirmedAt: new Date() } });

    await expect(service.confirm('client-user-1', 'booking-1', { paidAmount: 50 })).rejects.toThrow(
      PaymentAlreadyConfirmedException,
    );
  });

  it('throws PaymentNoteRequiredException when underpaid without a note', async () => {
    const { service } = build();

    await expect(service.confirm('client-user-1', 'booking-1', { paidAmount: 30 })).rejects.toThrow(
      PaymentNoteRequiredException,
    );
  });

  it('accepts an underpayment when a note is given, and records it', async () => {
    const { service, prisma, events } = build();

    await service.confirm('client-user-1', 'booking-1', {
      paidAmount: 30,
      note: 'The tiling was left unfinished.',
    });

    expect(prisma.db.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          paidAmount: 30,
          paymentNote: 'The tiling was left unfinished.',
          paymentConfirmedAt: expect.any(Date),
        },
      }),
    );
    expect(events.emit).toHaveBeenCalledWith('booking.payment_confirmed', expect.anything());
  });

  it('accepts the exact agreed price with no note required', async () => {
    const { service, prisma } = build();

    await service.confirm('client-user-1', 'booking-1', { paidAmount: 50 });

    expect(prisma.db.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidAmount: 50, paymentNote: null }),
      }),
    );
  });

  it('accepts more than the agreed price as a tip with no note required', async () => {
    const { service, prisma } = build();

    await service.confirm('client-user-1', 'booking-1', { paidAmount: 70 });

    expect(prisma.db.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidAmount: 70, paymentNote: null }),
      }),
    );
  });
});
