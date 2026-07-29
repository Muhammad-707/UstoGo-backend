import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ERROR_CODE } from '../constants/error-codes.constant';
import { mapPrismaError } from '../filters/prisma-exception.mapper';

const known = (
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('prisma failure', {
    code,
    clientVersion: 'test',
    ...(meta ? { meta } : {}),
  });

describe('mapPrismaError', () => {
  describe('P2002 unique violations', () => {
    it.each([
      ['email', ERROR_CODE.EMAIL_ALREADY_EXISTS],
      ['uq_users_email_active', ERROR_CODE.EMAIL_ALREADY_EXISTS],
      ['phone', ERROR_CODE.PHONE_ALREADY_EXISTS],
      ['booking_id', ERROR_CODE.REVIEW_ALREADY_EXISTS],
      ['review_id', ERROR_CODE.REPLY_ALREADY_EXISTS],
      ['slug', ERROR_CODE.CATEGORY_SLUG_TAKEN],
    ])('maps target %s to %s', (target, expected) => {
      const mapped = mapPrismaError(known('P2002', { target }));

      expect(mapped).toMatchObject({ status: HttpStatus.CONFLICT, code: expected });
      expect(mapped?.message.length).toBeGreaterThan(0);
    });

    it('accepts an array target, as Prisma reports composite constraints', () => {
      expect(mapPrismaError(known('P2002', { target: ['users', 'email'] }))?.code).toBe(
        ERROR_CODE.EMAIL_ALREADY_EXISTS,
      );
    });

    it('falls back to a generic conflict for an unrecognised target', () => {
      expect(mapPrismaError(known('P2002', { target: 'something_else' }))?.code).toBe(
        ERROR_CODE.CONFLICT,
      );
    });

    it('survives a missing meta', () => {
      expect(mapPrismaError(known('P2002'))?.code).toBe(ERROR_CODE.CONFLICT);
    });
  });

  it('maps P2003 to 422 INVALID_REFERENCE', () => {
    expect(mapPrismaError(known('P2003'))).toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ERROR_CODE.INVALID_REFERENCE,
    });
  });

  it('maps P2025 to 404 NOT_FOUND', () => {
    expect(mapPrismaError(known('P2025'))).toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: ERROR_CODE.NOT_FOUND,
    });
  });

  it('maps an exhausted P2034 to 409 CONFLICT', () => {
    expect(mapPrismaError(known('P2034'))).toMatchObject({
      status: HttpStatus.CONFLICT,
      code: ERROR_CODE.CONFLICT,
    });
  });

  // The GiST exclusion constraint is the last line of defence against double-booking.
  // Without this branch it would surface as a 500 and tell the client nothing.
  it('maps a 23P01 exclusion violation to 409 BOOKING_OVERLAP', () => {
    const raw = new Prisma.PrismaClientUnknownRequestError(
      'ERROR: conflicting key value violates exclusion constraint "bookings_no_overlap" (23P01)',
      { clientVersion: 'test' },
    );

    expect(mapPrismaError(raw)).toMatchObject({
      status: HttpStatus.CONFLICT,
      code: ERROR_CODE.BOOKING_OVERLAP,
    });
  });

  it('maps an initialisation failure to 503', () => {
    const error = new Prisma.PrismaClientInitializationError('cannot reach database', 'test');

    expect(mapPrismaError(error)).toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: ERROR_CODE.SERVICE_UNAVAILABLE,
    });
  });

  it('returns null for an unrecognised Prisma code so the caller can fall through', () => {
    expect(mapPrismaError(known('P2999'))).toBeNull();
  });

  it('returns null for an ordinary error', () => {
    expect(mapPrismaError(new Error('boom'))).toBeNull();
  });

  it('never leaks the raw Prisma message', () => {
    const mapped = mapPrismaError(known('P2002', { target: 'email' }));

    expect(mapped?.message).not.toContain('prisma failure');
  });
});
