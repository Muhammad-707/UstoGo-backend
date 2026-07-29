import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { mapPrismaError } from './prisma-exception.mapper';
import { ERROR_CODE, type ErrorCode } from '../constants/error-codes.constant';
import { AppException, type ErrorDetail } from '../exceptions/app.exception';

type ErrorBody = {
  // Typed as the enum rather than a plain number so that the comparisons in `log`
  // share a type with the HttpStatus members they are checked against.
  statusCode: HttpStatus;
  code: ErrorCode;
  message: string;
  details: readonly ErrorDetail[];
  path: string;
  timestamp: string;
  requestId: string;
};

/** Built-in Nest statuses mapped onto registry codes (ERROR_HANDLING.md §3, step 2). */
const STATUS_CODES: ReadonlyMap<number, ErrorCode> = new Map([
  [HttpStatus.BAD_REQUEST, ERROR_CODE.BAD_REQUEST],
  [HttpStatus.UNAUTHORIZED, ERROR_CODE.UNAUTHORIZED],
  [HttpStatus.FORBIDDEN, ERROR_CODE.FORBIDDEN],
  [HttpStatus.NOT_FOUND, ERROR_CODE.NOT_FOUND],
  [HttpStatus.CONFLICT, ERROR_CODE.CONFLICT],
  [HttpStatus.UNPROCESSABLE_ENTITY, ERROR_CODE.VALIDATION_FAILED],
  [HttpStatus.TOO_MANY_REQUESTS, ERROR_CODE.TOO_MANY_REQUESTS],
  [HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODE.SERVICE_UNAVAILABLE],
]);

const messageFrom = (response: string | object, fallback: string): string => {
  if (typeof response === 'string') {
    return response;
  }
  const { message } = response as { message?: unknown };
  if (typeof message === 'string') {
    return message;
  }
  // Nest's built-ins sometimes carry an array of strings; the envelope needs one line.
  return Array.isArray(message) ? message.join('; ') : fallback;
};

/**
 * The one place an HTTP error body is constructed (ERROR_HANDLING.md §3).
 *
 * `@Catch()` with no argument and registration as the last global filter means it also
 * catches what guards, pipes and interceptors throw — the paths that most often escape
 * a narrower filter and reach the client as an unshaped 500.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const body = this.toBody(exception, request);

    this.log(exception, request, body);

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, request: Request): ErrorBody {
    const { statusCode, code, message, details } = this.classify(exception);

    // Key order follows the envelope in ERROR_HANDLING.md §1 so that a response read
    // by eye lines up with the document that specifies it.
    return {
      statusCode,
      code,
      message,
      details,
      path: request.path,
      timestamp: new Date().toISOString(),
      requestId: request.requestId ?? 'unknown',
    };
  }

  private classify(
    exception: unknown,
  ): Pick<ErrorBody, 'statusCode' | 'code' | 'message' | 'details'> {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: messageFrom(exception.getResponse(), exception.message),
        details: exception.details,
      };
    }

    const prisma = mapPrismaError(exception);
    if (prisma !== null) {
      return { statusCode: prisma.status, code: prisma.code, message: prisma.message, details: [] };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        statusCode: status,
        code: STATUS_CODES.get(status) ?? ERROR_CODE.INTERNAL_SERVER_ERROR,
        message: messageFrom(exception.getResponse(), exception.message),
        details: [],
      };
    }

    // Anything unrecognised is a bug, and its message may quote SQL, a file path or a
    // dependency's internals. The client gets a fixed string; the detail goes to the log.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODE.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred.',
      details: [],
    };
  }

  /** Logging policy from ERROR_HANDLING.md §6. The request body is never included. */
  private log(exception: unknown, request: Request, body: ErrorBody): void {
    const { user } = request;
    const context = [
      `${request.method} ${request.path}`,
      `status=${String(body.statusCode)}`,
      `code=${body.code}`,
      `requestId=${body.requestId}`,
      user ? `userId=${user.id}` : undefined,
      body.statusCode === HttpStatus.UNAUTHORIZED || body.statusCode === HttpStatus.FORBIDDEN
        ? `ip=${request.ip ?? 'unknown'}`
        : undefined,
    ]
      .filter((part) => part !== undefined)
      .join(' ');

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(context, exception instanceof Error ? exception.stack : String(exception));
      return;
    }

    this.logger.warn(context);
  }
}
