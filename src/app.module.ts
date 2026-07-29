import { Module } from '@nestjs/common';

import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { LoggerModule } from './shared/logger/logger.module';

/**
 * Root module. Feature modules are registered here as they land, in the order
 * given by docs/ROADMAP.md — the wiring is the only thing this module owns.
 *
 * ConfigModule comes first because the logger and Prisma both read from it.
 *
 * CommonModule is imported before LoggerModule on purpose. Nest applies middleware in
 * module-import order, and pino-http computes its per-request log bindings once, when
 * its own middleware runs. Registered after the logger, RequestIdMiddleware would set
 * the correlation id too late and every structured log line would carry
 * `requestId: "unknown"` — breaking the one thing that field exists for.
 */
@Module({
  imports: [ConfigModule, CommonModule, LoggerModule, PrismaModule],
})
export class AppModule {}
