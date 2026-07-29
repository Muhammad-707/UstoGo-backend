const UNIT_SECONDS: Readonly<Record<string, number>> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
};

const PATTERN = /^(\d+)(ms|s|m|h|d)$/;

/**
 * Converts a duration such as `15m` or `30d` into seconds.
 *
 * The same strings configure `jsonwebtoken`, which accepts them directly — this exists
 * because the API also reports `expiresIn` as a number to clients, and deriving it from
 * the same string keeps the token's real lifetime and the advertised one from drifting.
 *
 * The environment schema has already rejected anything not matching this shape, so a
 * failure here means the two patterns disagree, which is a bug rather than bad input.
 */
export const durationToSeconds = (duration: string): number => {
  const match = PATTERN.exec(duration);

  if (match === null) {
    throw new Error(`Unsupported duration: ${duration}`);
  }

  const [, amount, unit] = match;
  return Number(amount) * (UNIT_SECONDS[unit ?? ''] ?? 0);
};
