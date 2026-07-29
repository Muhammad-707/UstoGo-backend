import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ERROR_CODE, type ErrorCode } from '../constants/error-codes.constant';

export type MappedPrismaError = {
  readonly status: HttpStatus;
  readonly code: ErrorCode;
  readonly message: string;
};

/**
 * Unique-constraint targets mapped to the code a client can act on. Prisma reports the
 * index or column names it violated; `uq_users_email_active` and a bare `email` both
 * mean the same thing to a caller.
 */
const UNIQUE_TARGET_CODES: ReadonlyArray<readonly [RegExp, ErrorCode, string]> = [
  [/email/i, ERROR_CODE.EMAIL_ALREADY_EXISTS, 'That email address is already registered.'],
  [/phone/i, ERROR_CODE.PHONE_ALREADY_EXISTS, 'That phone number is already registered.'],
  [/booking_id/i, ERROR_CODE.REVIEW_ALREADY_EXISTS, 'This booking already has a review.'],
  [/review_id/i, ERROR_CODE.REPLY_ALREADY_EXISTS, 'This review already has a reply.'],
  [/slug/i, ERROR_CODE.CATEGORY_SLUG_TAKEN, 'That slug is already taken.'],
];

/** PostgreSQL SQLSTATE for an exclusion-constraint violation. */
const EXCLUSION_VIOLATION = '23P01';

const targetOf = (error: Prisma.PrismaClientKnownRequestError): string => {
  const { target } = error.meta ?? {};
  if (Array.isArray(target)) {
    return target.join(',');
  }
  return typeof target === 'string' ? target : '';
};

const mapUniqueViolation = (error: Prisma.PrismaClientKnownRequestError): MappedPrismaError => {
  const target = targetOf(error);
  const match = UNIQUE_TARGET_CODES.find(([pattern]) => pattern.test(target));

  return {
    status: HttpStatus.CONFLICT,
    code: match?.[1] ?? ERROR_CODE.CONFLICT,
    message: match?.[2] ?? 'That value is already in use.',
  };
};

/**
 * Translates Prisma failures into the API's own vocabulary (ERROR_HANDLING.md §5).
 *
 * Raw Prisma errors must never reach a client: their messages carry table, column and
 * constraint names, which is a free schema dump for anyone probing the API.
 *
 * Returns `null` when the error is not one this mapper recognises, so the caller can
 * fall through to a generic 500 rather than guessing.
 */
export const mapPrismaError = (error: unknown): MappedPrismaError | null => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return mapUniqueViolation(error);

      case 'P2003':
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: ERROR_CODE.INVALID_REFERENCE,
          message: 'A referenced resource does not exist.',
        };

      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: ERROR_CODE.NOT_FOUND,
          message: 'Resource not found.',
        };

      // Reached only after TransactionManager has exhausted its retries.
      case 'P2034':
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODE.CONFLICT,
          message: 'The operation conflicted with a concurrent change. Retry after re-reading.',
        };

      default:
        return null;
    }
  }

  // The GiST exclusion constraint from DATABASE.md §7.1 is the last line of defence
  // against double-booking. Prisma surfaces it as an unknown raw error, so without this
  // branch the single most important integrity guarantee in the system would reach the
  // client as a 500 rather than a meaningful BOOKING_OVERLAP.
  if (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    error.message.includes(EXCLUSION_VIOLATION)
  ) {
    return {
      status: HttpStatus.CONFLICT,
      code: ERROR_CODE.BOOKING_OVERLAP,
      message: 'That time slot was taken by another booking.',
    };
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: ERROR_CODE.SERVICE_UNAVAILABLE,
      message: 'The service is temporarily unavailable.',
    };
  }

  return null;
};
