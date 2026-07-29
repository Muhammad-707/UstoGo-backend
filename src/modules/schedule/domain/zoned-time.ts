const MINUTE_MS = 60_000;

/**
 * Converts a wall-clock "local time" in an IANA timezone to the UTC instant it
 * represents, using only `Intl` (no date library — CLAUDE.md §5 forbids adding a
 * dependency without asking). A single guess-and-correct pass is enough because a
 * timezone offset only ever changes at a DST boundary, never mid-computation of one
 * offset lookup.
 */
export const zonedTimeToUtc = (date: string, time: string, timeZone: string): Date => {
  const dateParts = date.split('-');
  const timeParts = time.split(':');
  const year = Number(dateParts[0]);
  const month = Number(dateParts[1]);
  const day = Number(dateParts[2]);
  const hour = Number(timeParts[0]);
  const minute = Number(timeParts[1]);

  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offsetMs = tzOffsetMs(guess, timeZone);

  return new Date(guess.getTime() - offsetMs);
};

/** Offset (ms) such that `localWallClockMs = utcMs + offset`. */
const tzOffsetMs = (utcInstant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcInstant);

  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );

  return asUtc - utcInstant.getTime();
};

/** The calendar date (`YYYY-MM-DD`) an instant falls on on the given timezone's wall clock. */
export const zonedDateOf = (instant: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(instant);
};

/** Minutes since local midnight an instant falls at, in the given timezone. */
export const zonedMinuteOfDay = (instant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value);

  return get('hour') * 60 + get('minute');
};

export const addDays = (date: string, days: number): string => {
  const parts = date.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const next = new Date(Date.UTC(year, month - 1, day + days));

  return next.toISOString().slice(0, 10);
};

export const minutesBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / MINUTE_MS;
