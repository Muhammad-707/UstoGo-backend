import type { Env } from '../env.schema';

export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type AppConfig = {
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly port: number;
  readonly apiPrefix: string;
  readonly corsOrigins: readonly string[];
  readonly logLevel: LogLevel;
  readonly sentryDsn: string | null;
  readonly swaggerEnabled: boolean;
};

export const buildAppConfig = (env: Env): AppConfig =>
  Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    corsOrigins: Object.freeze(
      env.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
    logLevel: env.LOG_LEVEL,
    // Empty string means "not configured". Collapsing it to null here keeps every
    // consumer from having to know that convention.
    sentryDsn: env.SENTRY_DSN.length > 0 ? env.SENTRY_DSN : null,
    swaggerEnabled: env.SWAGGER_ENABLED,
  });
