import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditLogsController } from './controllers/audit-logs.controller';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AuditService } from './services/audit.service';

/**
 * F-16 (MODULES.md › AuditModule).
 *
 * `AuditInterceptor` is registered globally so every future `@Audit()`-decorated
 * mutation is covered without each feature module wiring its own — the same reason
 * `JwtAuthGuard` and `RolesGuard` are global rather than per-controller.
 */
@Module({
  controllers: [AuditLogsController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
