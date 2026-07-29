import { Injectable } from '@nestjs/common';

import { AppConfigService } from '@config/app-config.service';

import {
  HEALTH_CHECK_TIMEOUT_MS,
  type HealthCheckResult,
  type HealthIndicator,
} from '../health-check.type';

/**
 * Reachability of the object store (NFR-A-4).
 *
 * Scope, stated plainly: this proves the endpoint answers, not that the credentials
 * are valid or the bucket exists. Any HTTP status counts as up — S3 answers an
 * unsigned request with 403, and a 403 is proof the service is alive. Only a network
 * error or a timeout means down.
 *
 * A credentialed HEAD of the bucket is the stronger check and lands with
 * `StorageProvider` in TODO §1.9; this indicator is replaced by it rather than
 * extended, so readiness never claims more than it verifies.
 */
@Injectable()
export class StorageHealthIndicator implements HealthIndicator {
  readonly name = 'objectStorage';

  constructor(private readonly config: AppConfigService) {}

  async check(): Promise<HealthCheckResult> {
    const startedAt = Date.now();

    try {
      await fetch(this.config.storage.endpoint, {
        method: 'HEAD',
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });

      return { name: this.name, status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        name: this.name,
        status: 'down',
        latencyMs: Date.now() - startedAt,
        // The endpoint URL may embed a account-specific host; only the category leaves
        // the process.
        reason:
          error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'unreachable',
      };
    }
  }
}
