import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { createValidationPipe } from '../bootstrap/validation';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';
import { RequestIdMiddleware } from './middleware/request-id.middleware';

/**
 * Cross-cutting request machinery, applied globally so that a new controller inherits
 * validation, error shaping, timeouts and correlation without opting in — the
 * alternative is one forgotten decorator away from an unvalidated endpoint.
 *
 * Registration order matters: `APP_FILTER` providers run last-registered-first, so
 * `GlobalExceptionFilter` being the only one makes it the catch-all it is meant to be.
 */
@Module({
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Middleware runs before guards, so the correlation id exists by the time anything
    // can fail — including a 401 from the global auth guard.
    //
    // '{*path}' rather than '*': Nest 11 runs on Express 5, whose path-to-regexp
    // requires a named catch-all. The bare '*' still works only through a deprecation
    // shim that warns on every boot.
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
