import {
  DASHBOARD_DEFAULT_RANGE_DAYS,
  DASHBOARD_MAX_RANGE_DAYS,
  isValidDashboardRange,
  resolveDashboardRange,
} from '../dashboard-range.util';

describe('resolveDashboardRange', () => {
  const now = new Date('2026-07-30T12:00:00.000Z');

  it('defaults both bounds to a 30-day window ending now when neither is given', () => {
    const { from, to } = resolveDashboardRange(undefined, undefined, now);

    expect(to).toEqual(now);
    expect(from).toEqual(new Date(now.getTime() - DASHBOARD_DEFAULT_RANGE_DAYS * 86_400_000));
  });

  it('anchors the default `from` on an explicit `to`', () => {
    const to = '2026-01-31T00:00:00.000Z';
    const { from } = resolveDashboardRange(undefined, to, now);

    expect(from).toEqual(
      new Date(new Date(to).getTime() - DASHBOARD_DEFAULT_RANGE_DAYS * 86_400_000),
    );
  });

  it('defaults `to` to now when only `from` is given', () => {
    const { to } = resolveDashboardRange('2026-01-01T00:00:00.000Z', undefined, now);

    expect(to).toEqual(now);
  });

  it('uses both explicit bounds verbatim', () => {
    const { from, to } = resolveDashboardRange(
      '2026-01-01T00:00:00.000Z',
      '2026-01-31T00:00:00.000Z',
      now,
    );

    expect(from).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(to).toEqual(new Date('2026-01-31T00:00:00.000Z'));
  });
});

describe('isValidDashboardRange', () => {
  it('accepts a same-instant range', () => {
    const date = new Date('2026-07-30T00:00:00.000Z');
    expect(isValidDashboardRange(date, date)).toBe(true);
  });

  it('rejects `to` before `from`', () => {
    const from = new Date('2026-07-30T00:00:00.000Z');
    const to = new Date('2026-07-29T00:00:00.000Z');
    expect(isValidDashboardRange(from, to)).toBe(false);
  });

  it('accepts a span exactly at the cap', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date(from.getTime() + DASHBOARD_MAX_RANGE_DAYS * 86_400_000);
    expect(isValidDashboardRange(from, to)).toBe(true);
  });

  it('rejects a span beyond the cap', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date(from.getTime() + (DASHBOARD_MAX_RANGE_DAYS + 1) * 86_400_000);
    expect(isValidDashboardRange(from, to)).toBe(false);
  });
});
