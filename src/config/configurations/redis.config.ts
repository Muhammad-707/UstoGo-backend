import type { Env } from '../env.schema';

export type RedisConfig = {
  readonly url: string;
};

export const buildRedisConfig = (env: Env): RedisConfig =>
  Object.freeze({
    url: env.REDIS_URL,
  });
