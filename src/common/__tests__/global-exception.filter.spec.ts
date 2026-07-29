import { HttpStatus, NotFoundException as NestNotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ERROR_CODE } from '../constants/error-codes.constant';
import { ConflictException, ValidationFailedException } from '../exceptions/generic.exceptions';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';

type CapturedBody = {
  statusCode: number;
  code: string;
  message: string;
  details: unknown[];
  path: string;
  timestamp: string;
  requestId: string;
};

const runFilter = (
  exception: unknown,
  request: Record<string, unknown> = {},
): { status: number; body: CapturedBody } => {
  // Captured through typed closures rather than jest mocks, whose `mock.calls` are
  // `any` and would need an unsafe cast to read back.
  let capturedStatus = 0;
  let capturedBody: CapturedBody | undefined;

  const json = (body: CapturedBody): void => {
    capturedBody = body;
  };
  const status = (code: number): { json: typeof json } => {
    capturedStatus = code;
    return { json };
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        path: '/api/v1/bookings',
        requestId: 'req-123',
        ip: '203.0.113.7',
        ...request,
      }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  new GlobalExceptionFilter().catch(exception, host);

  if (capturedBody === undefined) {
    throw new Error('the filter did not write a response body');
  }

  return { status: capturedStatus, body: capturedBody };
};

describe('GlobalExceptionFilter', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  describe('the envelope', () => {
    it('carries every field ERROR_HANDLING.md §1 specifies', () => {
      const { body } = runFilter(new ConflictException(ERROR_CODE.SLOT_NOT_AVAILABLE, 'Taken.'));

      expect(Object.keys(body).sort()).toEqual([
        'code',
        'details',
        'message',
        'path',
        'requestId',
        'statusCode',
        'timestamp',
      ]);
    });

    it('mirrors the status into both the response and the body', () => {
      const { status, body } = runFilter(new ConflictException());

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('carries the correlation id from the request', () => {
      expect(runFilter(new ConflictException()).body.requestId).toBe('req-123');
    });

    it('falls back when no correlation id was set', () => {
      expect(runFilter(new ConflictException(), { requestId: undefined }).body.requestId).toBe(
        'unknown',
      );
    });

    it('emits an ISO-8601 timestamp', () => {
      expect(runFilter(new ConflictException()).body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });

  describe('AppException', () => {
    it('uses the exception’s own code, status and details', () => {
      const { body } = runFilter(
        new ValidationFailedException([{ field: 'email', constraints: ['must be an email'] }]),
      );

      expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body.code).toBe(ERROR_CODE.VALIDATION_FAILED);
      expect(body.details).toEqual([{ field: 'email', constraints: ['must be an email'] }]);
    });
  });

  describe('Prisma errors', () => {
    it('maps a unique violation rather than letting it reach the client raw', () => {
      const { body } = runFilter(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed on users.email', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: 'email' },
        }),
      );

      expect(body.statusCode).toBe(HttpStatus.CONFLICT);
      expect(body.code).toBe(ERROR_CODE.EMAIL_ALREADY_EXISTS);
      expect(body.message).not.toContain('users.email');
    });
  });

  describe("Nest's own exceptions", () => {
    it('maps a built-in status onto a registry code', () => {
      const { body } = runFilter(new NestNotFoundException());

      expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(body.code).toBe(ERROR_CODE.NOT_FOUND);
      expect(body.details).toEqual([]);
    });
  });

  describe('unknown failures', () => {
    it('returns a fixed 500 message', () => {
      const { body } = runFilter(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

      expect(body.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.code).toBe(ERROR_CODE.INTERNAL_SERVER_ERROR);
    });

    // The message of an unexpected error routinely quotes SQL, a host or a file path.
    it('never echoes the underlying message to the client', () => {
      const { body } = runFilter(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

      expect(body.message).toBe('An unexpected error occurred.');
      expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    });

    it('handles a thrown non-Error without crashing the filter', () => {
      expect(runFilter('a string was thrown').body.statusCode).toBe(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });
  });
});
