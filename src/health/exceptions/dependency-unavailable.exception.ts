import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException, type ErrorDetail } from '@common/exceptions/app.exception';

import type { HealthCheckResult } from '../health-check.type';

/**
 * Readiness failure, carried in the standard envelope (ERROR_HANDLING.md §1).
 *
 * A probe endpoint is still part of the API, so it does not get an envelope of its
 * own — but an operator reading a 503 needs to know *which* dependency is down. The
 * `details` array already exists for field-level violations and fits exactly: the
 * dependency name goes where the field name goes.
 */
export class DependencyUnavailableException extends AppException {
  constructor(failures: readonly HealthCheckResult[]) {
    const names = failures.map((failure) => failure.name).join(', ');

    super(
      ERROR_CODE.SERVICE_UNAVAILABLE,
      `Readiness check failed: ${names}`,
      HttpStatus.SERVICE_UNAVAILABLE,
      failures.map((failure): ErrorDetail => ({
        field: failure.name,
        constraints: [failure.reason ?? 'unavailable'],
      })),
    );
  }
}
