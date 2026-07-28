import { Injectable } from '@nestjs/common';

import {
  buildAppConfig,
  buildDatabaseConfig,
  buildJwtConfig,
  buildMailConfig,
  buildRedisConfig,
  buildStorageConfig,
  buildThrottleConfig,
} from './configurations';
import type {
  AppConfig,
  DatabaseConfig,
  JwtConfig,
  MailConfig,
  RedisConfig,
  StorageConfig,
  ThrottleConfig,
} from './configurations';
import type { Env } from './env.schema';

/**
 * The only typed view of the environment. Constructed once from an already-validated
 * `Env`, so every getter below is total — no consumer ever handles a missing value.
 *
 * Getters return grouped objects rather than scalars: a collaborator that needs JWT
 * settings declares that by asking for `jwt`, which makes its configuration surface
 * visible at the call site instead of scattered across eight individual reads.
 */
@Injectable()
export class AppConfigService {
  readonly app: AppConfig;
  readonly database: DatabaseConfig;
  readonly jwt: JwtConfig;
  readonly mail: MailConfig;
  readonly redis: RedisConfig;
  readonly storage: StorageConfig;
  readonly throttle: ThrottleConfig;

  constructor(env: Env) {
    this.app = buildAppConfig(env);
    this.database = buildDatabaseConfig(env);
    this.jwt = buildJwtConfig(env);
    this.mail = buildMailConfig(env);
    this.redis = buildRedisConfig(env);
    this.storage = buildStorageConfig(env);
    this.throttle = buildThrottleConfig(env);

    Object.freeze(this);
  }
}
