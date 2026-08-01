import { computeAvailability, computeBusySlots } from '../availability-calculator';

const TZ = 'Asia/Dushanbe'; // UTC+5, no DST

describe('computeAvailability', () => {
  it('expands a weekly rule into UTC slots chunked by duration', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [{ weekday: 1, startTime: '09:00', endTime: '11:00' }], // Monday
      exceptions: [],
      busyIntervals: [],
      from: '2026-08-03', // Monday
      to: '2026-08-03',
      durationMinutes: 60,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(slots).toEqual([
      new Date('2026-08-03T04:00:00.000Z'),
      new Date('2026-08-03T05:00:00.000Z'),
    ]);
  });

  it('returns [] for a date with no matching weekday rule and no exception', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [{ weekday: 1, startTime: '09:00', endTime: '11:00' }],
      exceptions: [],
      busyIntervals: [],
      from: '2026-08-04', // Tuesday
      to: '2026-08-04',
      durationMinutes: 60,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
  });

  it('a day-off exception removes an otherwise-working day', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [{ weekday: 1, startTime: '09:00', endTime: '11:00' }],
      exceptions: [{ date: '2026-08-03', isDayOff: true }],
      busyIntervals: [],
      from: '2026-08-03',
      to: '2026-08-03',
      durationMinutes: 60,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
  });

  it('a custom-hours exception overrides the weekly rule', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [{ weekday: 1, startTime: '09:00', endTime: '11:00' }],
      exceptions: [{ date: '2026-08-03', isDayOff: false, startTime: '14:00', endTime: '15:00' }],
      busyIntervals: [],
      from: '2026-08-03',
      to: '2026-08-03',
      durationMinutes: 60,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(slots).toEqual([new Date('2026-08-03T09:00:00.000Z')]);
  });

  it('subtracts a busy interval from the middle of the window', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }],
      exceptions: [],
      busyIntervals: [
        { start: new Date('2026-08-03T05:00:00.000Z'), end: new Date('2026-08-03T06:00:00.000Z') },
      ],
      from: '2026-08-03',
      to: '2026-08-03',
      durationMinutes: 60,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(slots).toEqual([
      new Date('2026-08-03T04:00:00.000Z'),
      new Date('2026-08-03T06:00:00.000Z'),
    ]);
  });

  it('clips a window to `now`, dropping elapsed time today', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [{ weekday: 1, startTime: '09:00', endTime: '11:00' }],
      exceptions: [],
      busyIntervals: [],
      from: '2026-08-03',
      to: '2026-08-03',
      durationMinutes: 60,
      now: new Date('2026-08-03T04:30:00.000Z'), // 09:30 local
    });

    expect(slots).toEqual([new Date('2026-08-03T04:30:00.000Z')]);
  });

  it('drops a fully elapsed day entirely', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [{ weekday: 1, startTime: '09:00', endTime: '11:00' }],
      exceptions: [],
      busyIntervals: [],
      from: '2026-08-03',
      to: '2026-08-03',
      durationMinutes: 60,
      now: new Date('2026-08-03T10:00:00.000Z'), // 15:00 local, past the window
    });

    expect(slots).toEqual([]);
  });

  it('never returns a slot that would overrun the window', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [{ weekday: 1, startTime: '09:00', endTime: '09:50' }],
      exceptions: [],
      busyIntervals: [],
      from: '2026-08-03',
      to: '2026-08-03',
      durationMinutes: 60,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
  });

  it('expands across multiple days in the range', () => {
    const slots = computeAvailability({
      timezone: TZ,
      workingDays: [
        { weekday: 1, startTime: '09:00', endTime: '10:00' },
        { weekday: 2, startTime: '09:00', endTime: '10:00' },
      ],
      exceptions: [],
      busyIntervals: [],
      from: '2026-08-03',
      to: '2026-08-04',
      durationMinutes: 60,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(slots).toEqual([
      new Date('2026-08-03T04:00:00.000Z'),
      new Date('2026-08-04T04:00:00.000Z'),
    ]);
  });
});

describe('computeBusySlots', () => {
  const input = {
    timezone: TZ,
    workingDays: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }],
    exceptions: [],
    from: '2026-08-03',
    to: '2026-08-03',
    durationMinutes: 60,
    now: new Date('2026-08-01T00:00:00.000Z'),
  };

  it('returns slot starts inside a busy interval', () => {
    const slots = computeBusySlots({
      ...input,
      busyIntervals: [
        { start: new Date('2026-08-03T05:00:00.000Z'), end: new Date('2026-08-03T07:00:00.000Z') },
      ],
    });

    expect(slots).toEqual([
      new Date('2026-08-03T05:00:00.000Z'),
      new Date('2026-08-03T06:00:00.000Z'),
    ]);
  });

  it('clips a busy interval to the working window', () => {
    const slots = computeBusySlots({
      ...input,
      busyIntervals: [
        { start: new Date('2026-08-03T03:00:00.000Z'), end: new Date('2026-08-03T07:00:00.000Z') },
      ],
    });

    expect(slots).toEqual([
      new Date('2026-08-03T04:00:00.000Z'),
      new Date('2026-08-03T05:00:00.000Z'),
      new Date('2026-08-03T06:00:00.000Z'),
    ]);
  });

  it('returns [] when the busy interval falls outside the window', () => {
    const slots = computeBusySlots({
      ...input,
      busyIntervals: [
        { start: new Date('2026-08-03T07:00:00.000Z'), end: new Date('2026-08-03T08:00:00.000Z') },
      ],
    });

    expect(slots).toEqual([]);
  });
});
