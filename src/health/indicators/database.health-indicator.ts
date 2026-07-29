import { Injectable } from '@nestjs/common';

import { PrismaService } from '@prisma-lib/prisma.service';

import {
  HEALTH_CHECK_TIMEOUT_MS,
  withTimeout,
  type HealthCheckResult,
  type HealthIndicator,
} from '../health-check.type';

@Injectable()
export class DatabaseHealthIndicator implements HealthIndicator {
  readonly name = 'database';

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthCheckResult> {
    const startedAt = Date.now();

    try {
      // A tagged template, not $queryRawUnsafe. `SELECT 1` deliberately touches no
      // table: readiness must report that the connection pool is serving, not that a
      // particular migration has run.
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, HEALTH_CHECK_TIMEOUT_MS);

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

/**
 * A database error message can quote the host, port, user and database name — the
 * readiness body is reachable by anything that can reach the probe, so it gets a
 * category, and the operator gets the detail from the logs.
 */
const reasonFor = (error: unknown): string =>
  error instanceof Error && error.message.startsWith('timed out')
    ? error.message
    : 'connection failed';
