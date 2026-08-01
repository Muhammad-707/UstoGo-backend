import { addDays, zonedTimeToUtc } from './zoned-time';

export type WorkingDayRule = { weekday: number; startTime: string; endTime: string };
export type ScheduleExceptionRule = {
  date: string;
  isDayOff: boolean;
  startTime?: string;
  endTime?: string;
};
export type BusyInterval = { start: Date; end: Date };

export type AvailabilityInput = {
  timezone: string;
  workingDays: WorkingDayRule[];
  exceptions: ScheduleExceptionRule[];
  /** ACCEPTED/IN_PROGRESS bookings (Phase 4). Always `[]` until `BookingsModule` exists. */
  busyIntervals: BusyInterval[];
  /** Calendar dates (`YYYY-MM-DD`), inclusive, in the master's own timezone. */
  from: string;
  to: string;
  durationMinutes: number;
  now: Date;
};

type Window = { start: Date; end: Date };

const weekdayOf = (date: string): number => {
  const parts = date.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const windowFor = (
  date: string,
  timezone: string,
  workingDays: WorkingDayRule[],
  exceptions: ScheduleExceptionRule[],
): Window | null => {
  const exception = exceptions.find((entry) => entry.date === date);

  if (exception !== undefined) {
    if (
      exception.isDayOff ||
      exception.startTime === undefined ||
      exception.endTime === undefined
    ) {
      return null;
    }
    return {
      start: zonedTimeToUtc(date, exception.startTime, timezone),
      end: zonedTimeToUtc(date, exception.endTime, timezone),
    };
  }

  const rule = workingDays.find((entry) => entry.weekday === weekdayOf(date));
  if (rule === undefined) {
    return null;
  }

  return {
    start: zonedTimeToUtc(date, rule.startTime, timezone),
    end: zonedTimeToUtc(date, rule.endTime, timezone),
  };
};

/** Clips a window to not start before `now` — the same clamp naturally empties any window in the past. */
const clampToNow = (window: Window, now: Date): Window => ({
  start: window.start < now ? now : window.start,
  end: window.end,
});

const subtractBusy = (window: Window, busy: readonly BusyInterval[]): Window[] =>
  busy.reduce<Window[]>(
    (free, interval) =>
      free.flatMap((w) => {
        if (interval.end <= w.start || interval.start >= w.end) {
          return [w];
        }
        const parts: Window[] = [];
        if (interval.start > w.start) {
          parts.push({ start: w.start, end: interval.start });
        }
        if (interval.end < w.end) {
          parts.push({ start: interval.end, end: w.end });
        }
        return parts;
      }),
    [window],
  );

const chunk = (window: Window, durationMinutes: number): Date[] => {
  const durationMs = durationMinutes * 60_000;
  const slots: Date[] = [];

  for (
    let cursor = window.start.getTime();
    cursor + durationMs <= window.end.getTime();
    cursor += durationMs
  ) {
    slots.push(new Date(cursor));
  }

  return slots;
};

/**
 * Pure function of (rules, exceptions, busy intervals, now) — MODULES.md §`ScheduleModule`.
 * Expands the weekly template across `[from, to]` in the master's own timezone, applies
 * exceptions, subtracts busy intervals and elapsed time, then chunks by service duration.
 * Returns UTC instants (FR-6.3); never throws — an empty result means no availability.
 */
export const computeAvailability = (input: AvailabilityInput): Date[] => {
  const slots: Date[] = [];

  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    const window = windowFor(date, input.timezone, input.workingDays, input.exceptions);
    if (window === null) {
      continue;
    }

    const clamped = clampToNow(window, input.now);
    if (clamped.start >= clamped.end) {
      continue;
    }

    for (const free of subtractBusy(clamped, input.busyIntervals)) {
      slots.push(...chunk(free, input.durationMinutes));
    }
  }

  return slots;
};

/**
 * Mirrors `computeAvailability` but returns the slot starts that fall inside a busy
 * interval, clipped to the master's working window. Lets the UI show already-taken
 * slots ("busy") instead of silently hiding them. Never throws.
 */
export const computeBusySlots = (input: AvailabilityInput): Date[] => {
  const slots: Date[] = [];

  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    const window = windowFor(date, input.timezone, input.workingDays, input.exceptions);
    if (window === null) {
      continue;
    }

    const clamped = clampToNow(window, input.now);
    if (clamped.start >= clamped.end) {
      continue;
    }

    for (const interval of input.busyIntervals) {
      const overlap: Window = {
        start: interval.start > clamped.start ? interval.start : clamped.start,
        end: interval.end < clamped.end ? interval.end : clamped.end,
      };
      if (overlap.start >= overlap.end) {
        continue;
      }
      slots.push(...chunk(overlap, input.durationMinutes));
    }
  }

  return slots;
};
