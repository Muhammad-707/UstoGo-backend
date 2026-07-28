import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AppConfigService } from '@config/app-config.service';

import { softDeleteExtension } from './extensions/soft-delete.extension';

/**
 * Declared as an explicit tuple of literals, not inferred. Prisma derives the `$on`
 * event overloads from this type, so widening it to `LogDefinition[]` would type every
 * event payload as `never`.
 */
type LogConfig = [
  { emit: 'event'; level: 'query' },
  { emit: 'event'; level: 'warn' },
  { emit: 'event'; level: 'error' },
];

const LOG_CONFIG: LogConfig = [
  { emit: 'event', level: 'query' },
  { emit: 'event', level: 'warn' },
  { emit: 'event', level: 'error' },
];

type ClientOptions = { log: LogConfig; datasourceUrl: string };

type BaseClient = PrismaClient<ClientOptions>;

const withSoftDelete = (client: BaseClient) => client.$extends(softDeleteExtension);

export type SoftDeleteAwareClient = ReturnType<typeof withSoftDelete>;

/**
 * Owns the PrismaClient lifecycle (MODULES.md › PrismaModule).
 *
 * Two views of the same connection pool are exposed deliberately:
 *   - `db` filters soft-deleted rows and is what application code uses.
 *   - the service itself is the unfiltered client, which is how `withDeleted()`
 *     repository variants and the reconciliation jobs reach deleted rows.
 *
 * Making the unfiltered client the one you have to name means bypassing soft delete
 * is visible in review rather than being the accidental default.
 */
@Injectable()
export class PrismaService
  extends PrismaClient<ClientOptions>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  readonly db: SoftDeleteAwareClient;

  constructor(private readonly config: AppConfigService) {
    super({
      datasourceUrl: config.database.url,
      // Emitted as events rather than written to stdout so that every line goes
      // through the application logger and its redaction rules.
      log: LOG_CONFIG,
    });

    this.db = withSoftDelete(this);
  }

  async onModuleInit(): Promise<void> {
    this.registerLogging();
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }

  private registerLogging(): void {
    this.$on('warn', (event) => this.logger.warn(event.message));
    this.$on('error', (event) => this.logger.error(event.message));

    if (this.config.app.isProduction) {
      return;
    }

    // `event.params` is deliberately never logged. It carries the bound values of
    // every statement — password hashes on insert, token hashes on lookup — and
    // SECURITY.md forbids those reaching a log line even in development.
    this.$on('query', (event) => {
      this.logger.debug(`${event.query} (${event.duration}ms)`);
    });
  }
}
