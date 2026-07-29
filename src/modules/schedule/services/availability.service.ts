import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { MastersSearchService } from '@modules/masters/services/masters-search.service';
import { ServiceNotFoundException } from '@modules/services/exceptions/services.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import {
  computeAvailability,
  type BusyInterval,
  type ScheduleExceptionRule,
  type WorkingDayRule,
} from '../domain/availability-calculator';
import { addDays, zonedTimeToUtc } from '../domain/zoned-time';
import { DateRangeTooLargeException } from '../exceptions/schedule.exceptions';

/** ACCEPTED/IN_PROGRESS bookings hold a slot; every other status frees it. */
const BUSY_STATUSES: readonly BookingStatus[] = [BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS];

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

    const { workingDays, exceptions, busyIntervals } = await this.loadRules(
      masterId,
      from,
      to,
      master.timezone,
    );

    return computeAvailability({
      timezone: master.timezone,
      workingDays,
      exceptions,
      busyIntervals,
      from,
      to,
      durationMinutes: service.durationMinutes,
      now: new Date(),
    });
  }

  private async loadRules(
    masterId: string,
    from: string,
    to: string,
    timezone: string,
  ): Promise<{
    workingDays: WorkingDayRule[];
    exceptions: ScheduleExceptionRule[];
    busyIntervals: BusyInterval[];
  }> {
    const rangeStart = zonedTimeToUtc(from, '00:00', timezone);
    const rangeEnd = zonedTimeToUtc(addDays(to, 1), '00:00', timezone);

    const [workingDays, exceptions, busyBookings] = await Promise.all([
      this.prisma.db.workingDay.findMany({ where: { masterProfileId: masterId } }),
      this.prisma.db.scheduleException.findMany({
        where: { masterProfileId: masterId, date: { gte: new Date(from), lte: new Date(to) } },
      }),
      this.prisma.db.booking.findMany({
        where: {
          masterProfileId: masterId,
          status: { in: [...BUSY_STATUSES] },
          scheduledAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
        },
        select: { scheduledAt: true, endsAt: true },
      }),
    ]);

    return {
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
      busyIntervals: busyBookings.map((booking) => ({
        start: booking.scheduledAt,
        end: booking.endsAt,
      })),
    };
  }
}
