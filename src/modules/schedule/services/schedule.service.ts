import { Injectable } from '@nestjs/common';
import type { ScheduleException, WorkingDay } from '@prisma/client';

import { MasterNotFoundException } from '@modules/masters/exceptions/masters.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import type { ReplaceScheduleDto } from '../dto/requests/replace-schedule.dto';
import type { CreateScheduleExceptionDto } from '../dto/requests/schedule-exception.dto';
import {
  ExceptionAlreadyExistsException,
  InvalidTimeRangeException,
  ScheduleOverlapException,
} from '../exceptions/schedule.exceptions';

const toTime = (hhmm: string): Date => {
  const parts = hhmm.split(':');
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
};

const overlaps = (
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean => a.startTime < b.endTime && b.startTime < a.endTime;

/** F-07 (MODULES.md › ScheduleModule). Weekly template and date exceptions. */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
  ) {}

  async listWorkingDays(userId: string): Promise<WorkingDay[]> {
    const masterProfileId = await this.masterProfileIdFor(userId);

    return this.prisma.db.workingDay.findMany({
      where: { masterProfileId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  /** Atomic replacement (FR-6.1): the whole weekly set is validated, then swapped in one transaction. */
  async replaceWorkingDays(userId: string, dto: ReplaceScheduleDto): Promise<WorkingDay[]> {
    const masterProfileId = await this.masterProfileIdFor(userId);
    this.assertNoOverlap(dto.days);

    return this.transactionManager.run(async (tx) => {
      await tx.workingDay.deleteMany({ where: { masterProfileId } });

      await tx.workingDay.createMany({
        data: dto.days.map((day) => ({
          masterProfileId,
          weekday: day.weekday,
          startTime: toTime(day.startTime),
          endTime: toTime(day.endTime),
        })),
      });

      return tx.workingDay.findMany({
        where: { masterProfileId },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      });
    });
  }

  async listExceptions(userId: string): Promise<ScheduleException[]> {
    const masterProfileId = await this.masterProfileIdFor(userId);

    return this.prisma.db.scheduleException.findMany({
      where: { masterProfileId },
      orderBy: { date: 'asc' },
    });
  }

  async createException(
    userId: string,
    dto: CreateScheduleExceptionDto,
  ): Promise<ScheduleException> {
    const masterProfileId = await this.masterProfileIdFor(userId);
    this.assertValidTimeRange(dto);

    const existing = await this.prisma.db.scheduleException.findUnique({
      where: { masterProfileId_date: { masterProfileId, date: new Date(dto.date) } },
    });
    if (existing !== null) {
      throw new ExceptionAlreadyExistsException();
    }

    return this.prisma.db.scheduleException.create({
      data: {
        masterProfileId,
        date: new Date(dto.date),
        isDayOff: dto.isDayOff,
        startTime: dto.isDayOff || dto.startTime === undefined ? null : toTime(dto.startTime),
        endTime: dto.isDayOff || dto.endTime === undefined ? null : toTime(dto.endTime),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
  }

  async removeException(userId: string, exceptionId: string): Promise<void> {
    const masterProfileId = await this.masterProfileIdFor(userId);

    await this.prisma.db.scheduleException.deleteMany({
      where: { id: exceptionId, masterProfileId },
    });
  }

  private assertValidTimeRange(dto: CreateScheduleExceptionDto): void {
    if (dto.isDayOff) {
      return;
    }
    if (dto.startTime === undefined || dto.endTime === undefined || dto.endTime <= dto.startTime) {
      throw new InvalidTimeRangeException();
    }
  }

  private assertNoOverlap(days: ReplaceScheduleDto['days']): void {
    for (let i = 0; i < days.length; i += 1) {
      for (let j = i + 1; j < days.length; j += 1) {
        const a = days[i];
        const b = days[j];
        if (a !== undefined && b !== undefined && a.weekday === b.weekday && overlaps(a, b)) {
          throw new ScheduleOverlapException();
        }
      }
    }
  }

  private async masterProfileIdFor(userId: string): Promise<string> {
    const master = await this.prisma.db.masterProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (master === null) {
      throw new MasterNotFoundException();
    }

    return master.id;
  }
}
