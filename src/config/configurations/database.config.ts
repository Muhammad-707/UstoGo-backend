import type { Env } from '../env.schema';

export type DatabaseConfig = {
  readonly url: string;
  readonly poolSize: number;
};

export const buildDatabaseConfig = (env: Env): DatabaseConfig =>
  Object.freeze({
    url: env.DATABASE_URL,
    poolSize: env.DATABASE_POOL_SIZE,
  });
