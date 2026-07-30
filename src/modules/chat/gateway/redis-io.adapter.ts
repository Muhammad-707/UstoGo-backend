import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';

import { RedisService } from '@shared/redis/redis.service';

/**
 * Fans `/chat` events out across every instance (ARCHITECTURE.md §7: "Socket.io
 * gateway ... rooms keyed by conversation id"). Without this, a message sent
 * through the REST API on instance A never reaches a socket connected to instance
 * B, because in-memory Socket.io rooms exist only within one process.
 *
 * Duplicates `RedisService`'s connection rather than opening two fresh ones: the
 * pub/sub client pair the adapter needs must not also be used for ordinary
 * commands, and `ioredis`'s `.duplicate()` is the documented way to get a second
 * connection sharing the same connection options.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapter?: ReturnType<typeof createAdapter>;

  constructor(private readonly appContext: INestApplicationContext) {
    super(appContext);
  }

  /**
   * Synchronous in practice — `ioredis.duplicate()` and `createAdapter()` do not
   * return promises — but kept as a method the caller awaits (`main.ts`) so it can
   * sit alongside the rest of the async bootstrap sequence without special-casing
   * one step as the only synchronous one.
   */
  connectToRedis(): void {
    const redis = this.appContext.get(RedisService);
    const pubClient = redis.client.duplicate();
    const subClient = redis.client.duplicate();

    this.adapter = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as {
      adapter: (value: ReturnType<typeof createAdapter>) => void;
    };

    if (this.adapter !== undefined) {
      server.adapter(this.adapter);
    }

    return server;
  }
}
