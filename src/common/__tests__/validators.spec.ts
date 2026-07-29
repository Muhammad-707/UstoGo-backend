import type { ValidationArguments } from 'class-validator';

import { IsAfterFieldConstraint } from '../validators/is-after-field.validator';
import { IsFutureDateConstraint } from '../validators/is-future-date.validator';
import { IsMultipleOfConstraint } from '../validators/is-multiple-of.validator';
import { IsSafeTextConstraint } from '../validators/is-safe-text.validator';
import { IsTimeZoneConstraint } from '../validators/is-time-zone.validator';
import { MaxRangeDaysConstraint } from '../validators/max-range-days.validator';

const args = (constraints: unknown[], object: object = {}): ValidationArguments => ({
  constraints,
  object,
  property: 'field',
  targetName: 'Dto',
  value: undefined,
});

describe('IsFutureDateConstraint', () => {
  const constraint = new IsFutureDateConstraint();
  const inMinutes = (minutes: number): string =>
    new Date(Date.now() + minutes * 60_000).toISOString();

  it('accepts a date beyond the lead time', () => {
    expect(constraint.validate(inMinutes(180), args([{ minLeadMinutes: 120 }]))).toBe(true);
  });

  it('rejects a date inside the lead time', () => {
    expect(constraint.validate(inMinutes(60), args([{ minLeadMinutes: 120 }]))).toBe(false);
  });

  it('rejects a past date when no lead time is required', () => {
    expect(constraint.validate(inMinutes(-1), args([{}]))).toBe(false);
  });

  it('rejects an unparseable date rather than treating NaN as valid', () => {
    expect(constraint.validate('not-a-date', args([{}]))).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(constraint.validate(1234, args([{}]))).toBe(false);
  });

  it('names the lead time in its message', () => {
    expect(constraint.defaultMessage(args([{ minLeadMinutes: 120 }]))).toContain('120 minutes');
  });
});

describe('IsMultipleOfConstraint', () => {
  const constraint = new IsMultipleOfConstraint();

  it.each([15, 30, 60, 1440])('accepts %i as a multiple of 15', (value) => {
    expect(constraint.validate(value, args([15]))).toBe(true);
  });

  it.each([1, 14, 16, 45.5])('rejects %p', (value) => {
    expect(constraint.validate(value, args([15]))).toBe(false);
  });

  it('rejects a non-number', () => {
    expect(constraint.validate('30', args([15]))).toBe(false);
  });

  it('rejects a divisor of zero instead of dividing by it', () => {
    expect(constraint.validate(30, args([0]))).toBe(false);
  });
});

describe('IsTimeZoneConstraint', () => {
  const constraint = new IsTimeZoneConstraint();

  it.each(['Asia/Tashkent', 'UTC', 'Europe/London'])('accepts %s', (zone) => {
    expect(constraint.validate(zone)).toBe(true);
  });

  it.each(['Mars/Olympus', 'GMT+5', '', 'not a zone'])('rejects %p', (zone) => {
    expect(constraint.validate(zone)).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(constraint.validate(42)).toBe(false);
  });
});

describe('IsAfterFieldConstraint', () => {
  const constraint = new IsAfterFieldConstraint();

  it('accepts an end time after the start time', () => {
    expect(constraint.validate('17:00', args(['startTime'], { startTime: '09:00' }))).toBe(true);
  });

  it('rejects an end time before the start time', () => {
    expect(constraint.validate('08:00', args(['startTime'], { startTime: '09:00' }))).toBe(false);
  });

  it('rejects equal times — a zero-length window is not a window', () => {
    expect(constraint.validate('09:00', args(['startTime'], { startTime: '09:00' }))).toBe(false);
  });

  it('rejects when the sibling field is missing', () => {
    expect(constraint.validate('17:00', args(['startTime'], {}))).toBe(false);
  });

  it('names the sibling field in its message', () => {
    expect(constraint.defaultMessage(args(['startTime']))).toContain('startTime');
  });
});

describe('MaxRangeDaysConstraint', () => {
  const constraint = new MaxRangeDaysConstraint();
  const range = { from: '2026-08-01T00:00:00.000Z', to: '2026-08-15T00:00:00.000Z' };
  const params = [31, { from: 'from', to: 'to' }];

  it('accepts a range inside the cap', () => {
    expect(constraint.validate(undefined, args(params, range))).toBe(true);
  });

  it('accepts a range exactly at the cap', () => {
    expect(
      constraint.validate(
        undefined,
        args(params, { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }),
      ),
    ).toBe(true);
  });

  it('rejects a range beyond the cap', () => {
    expect(
      constraint.validate(
        undefined,
        args(params, { from: '2026-08-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z' }),
      ),
    ).toBe(false);
  });

  it('rejects an inverted range', () => {
    expect(constraint.validate(undefined, args(params, { from: range.to, to: range.from }))).toBe(
      false,
    );
  });

  it('rejects an unparseable endpoint', () => {
    expect(constraint.validate(undefined, args(params, { from: 'nope', to: range.to }))).toBe(
      false,
    );
  });
});

describe('IsSafeTextConstraint', () => {
  const constraint = new IsSafeTextConstraint();

  it.each(['Aziz Karimov', 'Плотник', 'Ўзбек уста', 'O`tkir', 'tab\there'])(
    'accepts %p',
    (value) => {
      expect(constraint.validate(value)).toBe(true);
    },
  );

  it('rejects a zero-width space', () => {
    expect(constraint.validate(`admin${String.fromCodePoint(0x200b)}istrator`)).toBe(false);
  });

  it('rejects a right-to-left override', () => {
    expect(constraint.validate(`file${String.fromCodePoint(0x202e)}gnp.exe`)).toBe(false);
  });

  it('rejects a byte order mark', () => {
    expect(constraint.validate(`${String.fromCodePoint(0xfeff)}name`)).toBe(false);
  });

  it('rejects a C1 control character', () => {
    expect(constraint.validate(`a${String.fromCodePoint(0x0085)}b`)).toBe(false);
  });

  // Emoji live outside the basic multilingual plane; iterating by code unit rather
  // than code point would split them and could misjudge the surrogate halves.
  it('accepts an astral-plane character', () => {
    expect(constraint.validate('plumber 🔧')).toBe(true);
  });

  it('rejects a non-string', () => {
    expect(constraint.validate(null)).toBe(false);
  });
});
