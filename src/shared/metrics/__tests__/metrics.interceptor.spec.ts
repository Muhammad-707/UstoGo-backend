import { ForbiddenException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { MetricsInterceptor } from '../metrics.interceptor';
import type { MetricsService } from '../metrics.service';

const build = () => {
  const recordRequest = jest.fn();
  const metrics = { recordRequest } as unknown as MetricsService;
  const interceptor = new MetricsInterceptor(metrics);

  return { interceptor, recordRequest };
};

const contextFor = (route: string | undefined, method = 'GET'): ExecutionContext => {
  const response = { statusCode: 200 };
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        path: '/fallback',
        route: route === undefined ? undefined : { path: route },
      }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
};

const handlerReturning = (value: unknown): CallHandler => ({ handle: () => of(value) });
const handlerThrowing = (error: unknown): CallHandler => ({
  handle: () => throwError(() => error),
});

describe('MetricsInterceptor', () => {
  it('records the matched route pattern and 200 status on success', (done) => {
    const { interceptor, recordRequest } = build();

    interceptor
      .intercept(contextFor('/api/v1/bookings/:id'), handlerReturning({ ok: true }))
      .subscribe({
        complete: () => {
          expect(recordRequest).toHaveBeenCalledWith(
            'GET',
            '/api/v1/bookings/:id',
            200,
            expect.any(Number),
          );
          done();
        },
      });
  });

  it('falls back to the raw path when no route pattern is available', (done) => {
    const { interceptor, recordRequest } = build();

    interceptor.intercept(contextFor(undefined), handlerReturning({})).subscribe({
      complete: () => {
        expect(recordRequest).toHaveBeenCalledWith('GET', '/fallback', 200, expect.any(Number));
        done();
      },
    });
  });

  it('records the HttpException status and rethrows on failure', (done) => {
    const { interceptor, recordRequest } = build();
    const error = new ForbiddenException();

    interceptor.intercept(contextFor('/api/v1/admin/dashboard'), handlerThrowing(error)).subscribe({
      error: (thrown: unknown) => {
        expect(thrown).toBe(error);
        expect(recordRequest).toHaveBeenCalledWith(
          'GET',
          '/api/v1/admin/dashboard',
          403,
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('records 500 for a non-HttpException failure', (done) => {
    const { interceptor, recordRequest } = build();

    interceptor.intercept(contextFor('/api/v1/x'), handlerThrowing(new Error('boom'))).subscribe({
      error: () => {
        expect(recordRequest).toHaveBeenCalledWith('GET', '/api/v1/x', 500, expect.any(Number));
        done();
      },
    });
  });
});
