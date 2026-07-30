import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { IdempotencyService } from './services/idempotency.service';

/**
 * Phase 6 (`ROADMAP.md`). `IdempotencyInterceptor` is registered globally, the same way
 * `AuditModule` registers `AuditInterceptor` — a no-op for every route until
 * `@Idempotent()` opts one in, so adding this cannot start enforcing idempotency
 * anywhere by surprise.
 */
@Module({
  providers: [IdempotencyService, { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
})
export class IdempotencyModule {}
