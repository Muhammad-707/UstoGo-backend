import type { PrismaService } from '@prisma-lib/prisma.service';

import { BookingJobsService } from '../booking-jobs.service';

const DETAIL_ROW = {
  id: 'booking-1',
  scheduledAt: new Date(),
  clientProfile: { user: { id: 'client-user-1' } },
  masterProfile: { user: { id: 'master-user-1' } },
};

const build = (
  overrides: {
    queryRaw?: jest.Mock;
    bookingStatusHistory?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const prisma = {
    db: {
      $queryRaw: overrides.queryRaw ?? jest.fn().mockResolvedValue([]),
      bookingStatusHistory: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        ...overrides.bookingStatusHistory,
      },
      booking: {
        findMany: jest.fn().mockResolvedValue([DETAIL_ROW]),
        ...overrides.booking,
      },
    },
  } as unknown as PrismaService;

  const events = { emit: jest.fn() } as unknown as import('@nestjs/event-emitter').EventEmitter2;

  return { service: new BookingJobsService(prisma, events), prisma, events };
};

describe('BookingJobsService.expireDueBookings', () => {
  it('returns 0 and touches nothing further when no bookings are due', async () => {
    const { service, prisma } = build({ queryRaw: jest.fn().mockResolvedValue([]) });

    const count = await service.expireDueBookings();

    expect(count).toBe(0);
    expect(prisma.db.bookingStatusHistory.createMany).not.toHaveBeenCalled();
  });

  it('appends history and emits BookingExpiredEvent for every expired booking', async () => {
    const { service, prisma, events } = build({
      queryRaw: jest.fn().mockResolvedValue([{ id: 'booking-1' }]),
    });

    const count = await service.expireDueBookings();

    expect(count).toBe(1);
    expect(prisma.db.bookingStatusHistory.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          bookingId: 'booking-1',
          fromStatus: 'PENDING',
          toStatus: 'EXPIRED',
        }),
      ],
    });
    expect(events.emit).toHaveBeenCalledWith('booking.expired', expect.anything());
  });
});

describe('BookingJobsService.remindUpcomingBookings', () => {
  it('returns 0 when nothing is upcoming in the window', async () => {
    const { service } = build({ booking: { findMany: jest.fn().mockResolvedValue([]) } });

    const count = await service.remindUpcomingBookings(5);

    expect(count).toBe(0);
  });

  it('emits one reminder per party for every booking in the window', async () => {
    const { service, events } = build();

    const count = await service.remindUpcomingBookings(5);

    expect(count).toBe(1);
    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(events.emit).toHaveBeenCalledWith('booking.reminder', expect.anything());
  });
});
