import { MasterNotFoundException } from '@modules/masters/exceptions/masters.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import type { ReplaceScheduleDto } from '../../dto/requests/replace-schedule.dto';
import type { CreateScheduleExceptionDto } from '../../dto/requests/schedule-exception.dto';
import {
  ExceptionAlreadyExistsException,
  InvalidTimeRangeException,
  ScheduleOverlapException,
} from '../../exceptions/schedule.exceptions';
import { ScheduleService } from '../schedule.service';

const MASTER = { id: 'mp-1' };

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    workingDay?: Partial<Record<string, jest.Mock>>;
    scheduleException?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const masterProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue(MASTER),
    ...overrides.masterProfile,
  };
  const workingDayDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...overrides.workingDay,
  };
  const scheduleExceptionDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'exc-1' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides.scheduleException,
  };
  const prisma = {
    db: {
      masterProfile: masterProfileDelegate,
      workingDay: workingDayDelegate,
      scheduleException: scheduleExceptionDelegate,
    },
  } as unknown as PrismaService;
  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma.db)),
  } as unknown as TransactionManager;

  return { service: new ScheduleService(prisma, transactionManager), prisma, transactionManager };
};

describe('ScheduleService', () => {
  it('throws MasterNotFoundException when the caller has no profile', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.listWorkingDays('user-1')).rejects.toThrow(MasterNotFoundException);
  });

  it('rejects overlapping working-day rows for the same weekday', async () => {
    const { service } = build();
    const dto: ReplaceScheduleDto = {
      days: [
        { weekday: 1, startTime: '09:00', endTime: '12:00' },
        { weekday: 1, startTime: '11:00', endTime: '14:00' },
      ],
    };

    await expect(service.replaceWorkingDays('user-1', dto)).rejects.toThrow(
      ScheduleOverlapException,
    );
  });

  it('accepts non-overlapping working-day rows', async () => {
    const { service, prisma } = build();
    const dto: ReplaceScheduleDto = {
      days: [
        { weekday: 1, startTime: '09:00', endTime: '12:00' },
        { weekday: 1, startTime: '13:00', endTime: '17:00' },
        { weekday: 2, startTime: '09:00', endTime: '12:00' },
      ],
    };

    await service.replaceWorkingDays('user-1', dto);

    expect(prisma.db.workingDay.deleteMany).toHaveBeenCalledWith({
      where: { masterProfileId: 'mp-1' },
    });
    expect(prisma.db.workingDay.createMany).toHaveBeenCalled();
  });

  it('rejects a non-day-off exception with no times', async () => {
    const { service } = build();
    const dto: CreateScheduleExceptionDto = { date: '2026-08-15', isDayOff: false };

    await expect(service.createException('user-1', dto)).rejects.toThrow(InvalidTimeRangeException);
  });

  it('rejects a non-day-off exception where endTime is not after startTime', async () => {
    const { service } = build();
    const dto: CreateScheduleExceptionDto = {
      date: '2026-08-15',
      isDayOff: false,
      startTime: '10:00',
      endTime: '09:00',
    };

    await expect(service.createException('user-1', dto)).rejects.toThrow(InvalidTimeRangeException);
  });

  it('accepts a day-off exception with no times', async () => {
    const { service, prisma } = build();
    const dto: CreateScheduleExceptionDto = { date: '2026-08-15', isDayOff: true };

    await service.createException('user-1', dto);

    expect(prisma.db.scheduleException.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ startTime: null, endTime: null }),
      }),
    );
  });

  it('rejects a duplicate exception for the same date', async () => {
    const { service } = build({
      scheduleException: { findUnique: jest.fn().mockResolvedValue({ id: 'exc-existing' }) },
    });
    const dto: CreateScheduleExceptionDto = { date: '2026-08-15', isDayOff: true };

    await expect(service.createException('user-1', dto)).rejects.toThrow(
      ExceptionAlreadyExistsException,
    );
  });

  it('removes an exception scoped to the caller’s own profile', async () => {
    const { service, prisma } = build();

    await service.removeException('user-1', 'exc-1');

    expect(prisma.db.scheduleException.deleteMany).toHaveBeenCalledWith({
      where: { id: 'exc-1', masterProfileId: 'mp-1' },
    });
  });
});
