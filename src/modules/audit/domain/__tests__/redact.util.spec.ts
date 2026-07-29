import { redactSensitiveFields } from '../redact.util';

describe('redactSensitiveFields', () => {
  it('passes through primitives and null unchanged', () => {
    expect(redactSensitiveFields('x')).toBe('x');
    expect(redactSensitiveFields(1)).toBe(1);
    expect(redactSensitiveFields(true)).toBe(true);
    expect(redactSensitiveFields(null)).toBeNull();
    expect(redactSensitiveFields(undefined)).toBeUndefined();
  });

  it('serialises a Date to an ISO string', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');

    expect(redactSensitiveFields(date)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('redacts sensitive top-level keys', () => {
    expect(
      redactSensitiveFields({ email: 'a@b.com', password: 'hunter2', tokenHash: 'abc' }),
    ).toEqual({ email: 'a@b.com', password: '[REDACTED]', tokenHash: '[REDACTED]' });
  });

  it('redacts sensitive keys at any depth', () => {
    expect(redactSensitiveFields({ user: { credentials: { passwordHash: 'x' } } })).toEqual({
      user: { credentials: { passwordHash: '[REDACTED]' } },
    });
  });

  it('redacts inside arrays without flattening them', () => {
    expect(redactSensitiveFields([{ refreshToken: 'x' }, { name: 'ok' }])).toEqual([
      { refreshToken: '[REDACTED]' },
      { name: 'ok' },
    ]);
  });
});
