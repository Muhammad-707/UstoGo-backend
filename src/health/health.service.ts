import { Injectable, Logger } from '@nestjs/common';

import { DependencyUnavailableException } from './exceptions/dependency-unavailable.exception';
import type { HealthCheckResult, HealthIndicator } from './health-check.type';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator';
import { StorageHealthIndicator } from './indicators/storage.health-indicator';

export type ReadinessReport = {
  readonly checks: Readonly<Record<string, { status: 'up' | 'down'; latencyMs: number }>>;
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly indicators: readonly HealthIndicator[];

  constructor(database: DatabaseHealthIndicator, storage: StorageHealthIndicator) {
    this.indicators = [database, storage];
  }

  /**
   * Runs every dependency probe and throws when any is down.
   *
   * Probes run concurrently and none of them throws, so one slow dependency does not
   * delay the verdict on the others and one broken dependency does not hide the rest.
   * An operator gets the full picture from a single call — which is the difference
   * between "the database is down" and "everything is down", and therefore between a
   * five-minute fix and an hour of guessing.
   *
   * @throws {DependencyUnavailableException} listing every failing dependency.
   */
  async checkReadiness(): Promise<ReadinessReport> {
    const results = await Promise.all(this.indicators.map((indicator) => indicator.check()));
    const failures = results.filter((result) => result.status === 'down');

    if (failures.length > 0) {
      this.logFailures(failures);
      throw new DependencyUnavailableException(failures);
    }

    return { checks: toReport(results) };
  }

  private logFailures(failures: readonly HealthCheckResult[]): void {
    for (const failure of failures) {
      this.logger.error(
        `Readiness check failed: ${failure.name} (${failure.reason ?? 'unavailable'}) after ${String(failure.latencyMs)}ms`,
      );
    }
  }
}

/** The reason is deliberately dropped here: it belongs in the 503 body and the log. */
const toReport = (results: readonly HealthCheckResult[]): ReadinessReport['checks'] =>
  Object.fromEntries(
    results.map((result) => [result.name, { status: result.status, latencyMs: result.latencyMs }]),
  );
