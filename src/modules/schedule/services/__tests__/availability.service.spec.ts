import type { MastersSearchService } from '@modules/masters/services/masters-search.service';
import { ServiceNotFoundException } from '@modules/services/exceptions/services.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { DateRangeTooLargeException } from '../../exceptions/schedule.exceptions';
import { AvailabilityService } from '../availability.service';

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
    workingDay?: Partial<Record<string, jest.Mock>>;
    scheduleException?: Partial<Record<string, jest.Mock>>;
    booking?: Partial<Record<string, jest.Mock>>;
    assertPublic?: jest.Mock;
  } = {},
) => {
  const prisma = {
    db: {
      masterProfile: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'Asia/Dushanbe' }),
        ...overrides.masterProfile,
      },
      service: {
        findFirst: jest.fn().mockResolvedValue({ durationMinutes: 60 }),
        ...overrides.service,
      },
      workingDay: { findMany: jest.fn().mockResolvedValue([]), ...overrides.workingDay },
      scheduleException: {
        findMany: jest.fn().mockResolvedValue([]),
        ...overrides.scheduleException,
      },
      booking: { findMany: jest.fn().mockResolvedValue([]), ...overrides.booking },
    },
  } as unknown as PrismaService;
  const mastersSearch = {
    assertPublic: overrides.assertPublic ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as MastersSearchService;

  return { service: new AvailabilityService(prisma, mastersSearch), prisma, mastersSearch };
};

describe('AvailabilityService', () => {
  it('rejects a range over 31 days before touching the database', async () => {
    const { service, mastersSearch } = build();

    await expect(service.compute('m-1', '2026-01-01', '2026-03-01', 's-1')).rejects.toThrow(
      DateRangeTooLargeException,
    );
    expect(mastersSearch.assertPublic).not.toHaveBeenCalled();
  });

  it('throws MasterNotFoundException via assertPublic when the master is not public', async () => {
    const notFound = jest.fn().mockRejectedValue(new Error('not found'));
    const { service } = build({ assertPublic: notFound });

    await expect(service.compute('m-1', '2026-08-01', '2026-08-02', 's-1')).rejects.toThrow(
      'not found',
    );
  });

  it('throws ServiceNotFoundException when the service does not belong to the master', async () => {
    const { service } = build({ service: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.compute('m-1', '2026-08-01', '2026-08-02', 's-1')).rejects.toThrow(
      ServiceNotFoundException,
    );
  });

  it('returns [] when there is no working day rule', async () => {
    const { service } = build();

    const slots = await service.compute('m-1', '2026-08-03', '2026-08-03', 's-1');

    expect(slots).toEqual([]);
  });

  it('computes slots from the master’s own weekly rule', async () => {
    const { service } = build({
      workingDay: {
        findMany: jest.fn().mockResolvedValue([
          {
            weekday: 1,
            startTime: new Date('1970-01-01T09:00:00.000Z'),
            endTime: new Date('1970-01-01T11:00:00.000Z'),
          },
        ]),
      },
    });

    const slots = await service.compute('m-1', '2026-08-03', '2026-08-03', 's-1');

    expect(slots).toEqual([
      new Date('2026-08-03T04:00:00.000Z'),
      new Date('2026-08-03T05:00:00.000Z'),
    ]);
  });

  it('subtracts ACCEPTED/IN_PROGRESS bookings from the computed slots', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        scheduledAt: new Date('2026-08-03T04:00:00.000Z'),
        endsAt: new Date('2026-08-03T05:00:00.000Z'),
      },
    ]);
    const { service, prisma } = build({
      workingDay: {
        findMany: jest.fn().mockResolvedValue([
          {
            weekday: 1,
            startTime: new Date('1970-01-01T09:00:00.000Z'),
            endTime: new Date('1970-01-01T11:00:00.000Z'),
          },
        ]),
      },
      booking: { findMany },
    });

    const slots = await service.compute('m-1', '2026-08-03', '2026-08-03', 's-1');

    expect(slots).toEqual([new Date('2026-08-03T05:00:00.000Z')]);
    expect(prisma.db.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ masterProfileId: 'm-1' }) }),
    );
  });
});
