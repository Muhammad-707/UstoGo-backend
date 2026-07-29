import type { Env } from '../env.schema';

/** BR-24: one deployment, one currency (D-3). */
export type CatalogueConfig = {
  readonly currency: string;
};

export const buildCatalogueConfig = (env: Env): CatalogueConfig =>
  Object.freeze({
    currency: env.SERVICE_CURRENCY,
  });
