import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * One line per completed request, carrying the correlation id.
 *
 * Only failures are logged by `GlobalExceptionFilter`, so without this there is no
 * record that a successful request happened at all — and "it returned 200, just slowly"
 * is exactly the case you need the timing for.
 *
 * The request body is never logged (ERROR_HANDLING.md §6): on the auth routes it is
 * a password, and a redaction list applied per call site is a redaction list that
 * eventually misses one.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = http.getResponse<Response>();
          const { user } = request;

          this.logger.log(
            [
              `${request.method} ${request.path}`,
              `status=${String(response.statusCode)}`,
              `duration=${String(Date.now() - startedAt)}ms`,
              `requestId=${request.requestId ?? 'unknown'}`,
              user ? `userId=${user.id}` : undefined,
            ]
              .filter((part) => part !== undefined)
              .join(' '),
          );
        },
        // Failures are logged by GlobalExceptionFilter, with the status it decided on.
        // Logging them here as well would double every error line.
        error: () => undefined,
      }),
    );
  }
}
