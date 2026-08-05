import { Injectable } from '@nestjs/common';

import { RedisService } from '@shared/redis/redis.service';

import {
  HEALTH_CHECK_TIMEOUT_MS,
  withTimeout,
  type HealthCheckResult,
  type HealthIndicator,
} from '../health-check.type';

/**
 * Reachability of Redis (rate-limit storage and the `/chat`/`/bookings` Socket.io
 * fan-out both hard-depend on it, `STATUS.md` §1 flagged this indicator as missing).
 *
 * `PING` deliberately touches no key: readiness must report that the connection is
 * serving commands, not that any particular value exists.
 */
@Injectable()
export class RedisHealthIndicator implements HealthIndicator {
  readonly name = 'redis';

  constructor(private readonly redis: RedisService) {}

  async check(): Promise<HealthCheckResult> {
    const startedAt = Date.now();

    try {
      await withTimeout(this.redis.client.ping(), HEALTH_CHECK_TIMEOUT_MS);

      return { name: this.name, status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        name: this.name,
        status: 'down',
        latencyMs: Date.now() - startedAt,
        reason: reasonFor(error),
      };
    }
  }
}

const reasonFor = (error: unknown): string =>
  error instanceof Error && error.message.startsWith('timed out')
    ? error.message
    : 'connection failed';
