import { Module } from '@nestjs/common';

import { ConfigModule } from '@config/config.module';
import { PrismaModule } from '@prisma-lib/prisma.module';

import { CreateAdminCommand } from './commands/create-admin.command';
import { PROMPTER, TerminalPrompter } from './prompt';
import { PasswordService } from '../modules/auth/services/password.service';

/**
 * The context the CLI runs in — deliberately not `AppModule`.
 *
 * A command needs configuration, a database connection and password hashing. Booting
 * the application module instead would start the cron scheduler, the throttler and the
 * global guards in a process that serves no requests, and `admin:create` would begin
 * running the hourly file-cleanup job as a side effect of creating an account.
 *
 * `PasswordService` is registered here rather than imported from `AuthModule` for the
 * same reason: it is a stateless bcrypt wrapper over `AppConfigService`, while
 * `AuthModule` also carries the JWT and Passport machinery that a CLI has no use for.
 * The cost is one line of registration; the alternative is a second copy of the hashing
 * policy, which is the thing that must not diverge.
 */
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    CreateAdminCommand,
    PasswordService,
    { provide: PROMPTER, useClass: TerminalPrompter },
  ],
})
export class CliModule {}
