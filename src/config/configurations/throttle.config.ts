import type { Env } from '../env.schema';

/** Global default only. Per-endpoint limits live with their routes (API.md §13). */
export type ThrottleConfig = {
  readonly ttlSeconds: number;
  readonly limit: number;
};

export const buildThrottleConfig = (env: Env): ThrottleConfig =>
  Object.freeze({
    ttlSeconds: env.THROTTLE_TTL,
    limit: env.THROTTLE_LIMIT,
  });
