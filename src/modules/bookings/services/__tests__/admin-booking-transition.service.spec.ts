import type { TransactionManager } from '@prisma-lib/transaction.manager';

import { BookingNotFoundException } from '../../exceptions/bookings.exceptions';
import { AdminBookingTransitionService } from '../admin-booking-transition.service';

const bookingRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'booking-1',
  status: 'ACCEPTED',
  masterProfile: { user: { id: 'master-user-1' } },
  clientProfile: { user: { id: 'client-user-1' } },
  ...overrides,
});

const build = (findUnique = jest.fn().mockResolvedValue(bookingRow())) => {
  const tx = {
    booking: { findUnique, update: jest.fn().mockResolvedValue(bookingRow()) },
    bookingStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as TransactionManager;
  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return { service: new AdminBookingTransitionService(transactionManager, events), tx, events };
};

describe('AdminBookingTransitionService.cancel', () => {
  it('force-cancels an ACCEPTED booking and notifies both parties', async () => {
    const { service, events } = build();

    await service.cancel('booking-1', 'Policy violation');

    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(events.emit).toHaveBeenCalledWith('booking.cancelled', expect.anything());
  });

  it('throws BookingNotFoundException for an unknown booking', async () => {
    const { service } = build(jest.fn().mockResolvedValue(null));

    await expect(service.cancel('missing', 'reason')).rejects.toThrow(BookingNotFoundException);
  });
});
