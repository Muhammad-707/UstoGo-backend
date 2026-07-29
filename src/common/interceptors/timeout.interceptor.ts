import {
  Injectable,
  RequestTimeoutException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { throwError, TimeoutError, type Observable } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/** Comfortably above the p95 latency targets in NFR-P, below any sane client timeout. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Bounds how long a request may occupy a connection.
 *
 * Without it, one stuck query holds a worker and a database connection indefinitely,
 * and enough of them exhaust the pool — turning a slow dependency into a full outage.
 * A 408 lets the caller decide what to do while the server stays responsive.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(REQUEST_TIMEOUT_MS),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError ? new RequestTimeoutException() : (error as Error),
        ),
      ),
    );
  }
}
