import {
  HttpException,
  HttpStatus,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { catchError, tap, throwError } from 'rxjs';

import type { AppRequest } from '@common/types/app-request.type';

import { MetricsService } from './metrics.service';

/** Matched route pattern (`/bookings/:id`), never the raw path — an id in the label
 * would give every distinct resource its own time series. */
const routeOf = (request: AppRequest): string =>
  (request as unknown as { route?: { path?: string } }).route?.path ?? request.path;

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    const route = routeOf(request);

    const record = (status: number): void => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.recordRequest(request.method, route, status, seconds);
    };

    return next.handle().pipe(
      tap(() => record(response.statusCode)),
      catchError((error: unknown) => {
        record(
          error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        );
        return throwError(() => error);
      }),
    );
  }
}
