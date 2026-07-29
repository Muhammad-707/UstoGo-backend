import { HttpException, type HttpStatus } from '@nestjs/common';

import type { ErrorCode } from '../constants/error-codes.constant';

/** One field-level violation. Populated for 422; empty for every other status. */
export type ErrorDetail = {
  readonly field: string;
  readonly constraints: readonly string[];
};

/**
 * Base for every domain error (ERROR_HANDLING.md §2).
 *
 * Extending Nest's `HttpException` rather than replacing it means anything Nest already
 * throws — from guards, pipes, the router — still lands in the same filter and comes out
 * in the same envelope. The only thing this class adds is a stable machine-readable
 * `code`, because that is what clients branch on.
 *
 * Subclasses are named after the business condition, never the HTTP status:
 * `SlotNotAvailableException`, not `BookingConflictException`.
 */
export abstract class AppException extends HttpException {
  protected constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details: readonly ErrorDetail[] = [],
  ) {
    super({ code, message, details }, status);
    this.name = new.target.name;
  }
}
