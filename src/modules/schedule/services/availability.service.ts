import { Injectable } from '@nestjs/common';

import { MastersSearchService } from '@modules/masters/services/masters-search.service';
import { ServiceNotFoundException } from '@modules/services/exceptions/services.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import { computeAvailability } from '../domain/availability-calculator';
import { DateRangeTooLargeException } from '../exceptions/schedule.exceptions';

const MAX_RANGE_DAYS = 31;
const MS_PER_DAY = 86_400_000;

const toHhMm = (time: Date): string => time.toISOString().slice(11, 16);
const toYyyyMmDd = (date: Date): string => date.toISOString().slice(0, 10);

/** F-07 (MODULES.md › ScheduleModule). Read-only: computes slots, never mutates. */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mastersSearch: MastersSearchService,
  ) {}

  async compute(masterId: string, from: string, to: string, serviceId: string): Promise<Date[]> {
    if ((new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY > MAX_RANGE_DAYS) {
      throw new DateRangeTooLargeException();
    }

    await this.mastersSearch.assertPublic(masterId);

    const [master, service] = await Promise.all([
      this.prisma.db.masterProfile.findUniqueOrThrow({
        where: { id: masterId },
        select: { timezone: true },
      }),
      this.prisma.db.service.findFirst({
        where: { id: serviceId, masterProfileId: masterId, isActive: true },
        select: { durationMinutes: true },
      }),
    ]);

    if (service === null) {
      throw new ServiceNotFoundException();
    }

    const [workingDays, exceptions] = await Promise.all([
      this.prisma.db.workingDay.findMany({ where: { masterProfileId: masterId } }),
      this.prisma.db.scheduleException.findMany({
        where: { masterProfileId: masterId, date: { gte: new Date(from), lte: new Date(to) } },
      }),
    ]);

    return computeAvailability({
      timezone: master.timezone,
      workingDays: workingDays.map((day) => ({
        weekday: day.weekday,
        startTime: toHhMm(day.startTime),
        endTime: toHhMm(day.endTime),
      })),
      exceptions: exceptions.map((exception) => ({
        date: toYyyyMmDd(exception.date),
        isDayOff: exception.isDayOff,
        ...(exception.startTime !== null ? { startTime: toHhMm(exception.startTime) } : {}),
        ...(exception.endTime !== null ? { endTime: toHhMm(exception.endTime) } : {}),
      })),
      // No Booking model until Phase 4 (F-09) — nothing to subtract yet.
      busyIntervals: [],
      from,
      to,
      durationMinutes: service.durationMinutes,
      now: new Date(),
    });
  }
}
