import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AppConfigService } from './config/app-config.service';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { GLOBAL_THROTTLE_NAME } from './modules/auth/constants/throttle.constants';
import { FilesModule } from './modules/files/files.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { LoggerModule } from './shared/logger/logger.module';
import { MailModule } from './shared/mail/mail.module';
import { StorageModule } from './shared/storage/storage.module';

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
  imports: [
    ConfigModule,
    CommonModule,
    LoggerModule,
    PrismaModule,
    MailModule,
    StorageModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // Exactly one throttler, overridden per route by `@Throttle({ default: … })`.
        //
        // Declaring one named throttler per endpoint does not work: every declared
        // throttler applies to every route, and `@Throttle` only overrides the one it
        // names. With six declared, a registration was simultaneously limited by the
        // forgot-password bucket and started returning 429 on the fourth attempt.
        throttlers: [
          {
            name: GLOBAL_THROTTLE_NAME,
            ttl: config.throttle.ttlSeconds * 1000,
            limit: config.throttle.limit,
          },
        ],
      }),
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    FilesModule,
    JobsModule,
  ],
  providers: [
    // Order matters: these run in registration order, which is the stack documented in
    // AUTHORIZATION.md §2 — rate limit, then authenticate, then check the role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
