import type { ValidationArguments } from 'class-validator';

import { IsAfterFieldIfPresentConstraint } from '../is-after-field-if-present.validator';

const args = (constraints: unknown[], object: object = {}): ValidationArguments => ({
  constraints,
  object,
  property: 'endsAt',
  targetName: 'Dto',
  value: undefined,
});

describe('IsAfterFieldIfPresentConstraint', () => {
  const constraint = new IsAfterFieldIfPresentConstraint();

  it('accepts when the sibling is absent — nothing to be after yet', () => {
    expect(constraint.validate('2026-08-01T00:00:00.000Z', args(['startsAt'], {}))).toBe(true);
  });

  it('accepts an end date after the start date when both are given', () => {
    expect(
      constraint.validate(
        '2026-08-02T00:00:00.000Z',
        args(['startsAt'], { startsAt: '2026-08-01T00:00:00.000Z' }),
      ),
    ).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    expect(
      constraint.validate(
        '2026-07-01T00:00:00.000Z',
        args(['startsAt'], { startsAt: '2026-08-01T00:00:00.000Z' }),
      ),
    ).toBe(false);
  });

  it('rejects equal instants — a zero-length window is not a window', () => {
    const same = '2026-08-01T00:00:00.000Z';
    expect(constraint.validate(same, args(['startsAt'], { startsAt: same }))).toBe(false);
  });

  it('rejects a non-string value when the sibling is present', () => {
    expect(constraint.validate(1234, args(['startsAt'], { startsAt: '2026-08-01' }))).toBe(false);
  });

  it('names the sibling field in its message', () => {
    expect(constraint.defaultMessage(args(['startsAt']))).toContain('startsAt');
  });
});
