import { isWithinActiveWindow, type BannerWindow } from '../active-window.util';

const NOW = new Date('2026-07-30T12:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2027-01-01T00:00:00.000Z');

const window = (overrides: Partial<BannerWindow> = {}): BannerWindow => ({
  isActive: true,
  startsAt: null,
  endsAt: null,
  ...overrides,
});

describe('isWithinActiveWindow', () => {
  it('rejects a banner that is not active regardless of its window', () => {
    expect(isWithinActiveWindow(window({ isActive: false }), NOW)).toBe(false);
  });

  it('accepts an active banner with no bounds at all', () => {
    expect(isWithinActiveWindow(window(), NOW)).toBe(true);
  });

  it('accepts when only startsAt is set and it has passed', () => {
    expect(isWithinActiveWindow(window({ startsAt: PAST }), NOW)).toBe(true);
  });

  it('rejects when only startsAt is set and it is in the future (not yet started)', () => {
    expect(isWithinActiveWindow(window({ startsAt: FUTURE }), NOW)).toBe(false);
  });

  it('accepts when only endsAt is set and it has not passed', () => {
    expect(isWithinActiveWindow(window({ endsAt: FUTURE }), NOW)).toBe(true);
  });

  it('rejects when only endsAt is set and it has passed (expired)', () => {
    expect(isWithinActiveWindow(window({ endsAt: PAST }), NOW)).toBe(false);
  });

  it('accepts when both bounds are set and now falls inside them', () => {
    expect(isWithinActiveWindow(window({ startsAt: PAST, endsAt: FUTURE }), NOW)).toBe(true);
  });

  it('rejects when both bounds are set and now is before startsAt', () => {
    expect(isWithinActiveWindow(window({ startsAt: FUTURE, endsAt: FUTURE }), NOW)).toBe(false);
  });

  it('rejects when both bounds are set and now is after endsAt', () => {
    expect(isWithinActiveWindow(window({ startsAt: PAST, endsAt: PAST }), NOW)).toBe(false);
  });

  it('accepts the exact boundary instants (inclusive on both ends)', () => {
    expect(isWithinActiveWindow(window({ startsAt: NOW, endsAt: NOW }), NOW)).toBe(true);
  });
});
