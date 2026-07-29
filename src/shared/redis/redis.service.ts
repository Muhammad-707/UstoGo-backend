import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { AppConfigService } from '@config/app-config.service';

/**
 * The one Redis connection the process holds (AUTHENTICATION.md §9, ARCHITECTURE.md
 * multi-instance fan-out). Owns the client's lifecycle so a consumer never constructs
 * its own — a second connection would double the connection-pool footprint for no
 * benefit, since ioredis already pipelines concurrent commands over one socket.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.redis.url, {
      // Rate limiting must fail fast rather than queue commands behind a dead
      // connection — a slow Redis must never become a slow /auth/login.
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
