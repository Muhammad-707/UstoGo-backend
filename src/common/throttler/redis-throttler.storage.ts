import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

import type { RedisService } from '@shared/redis/redis.service';

/**
 * Mirrors `@nestjs/throttler`'s in-memory storage exactly — hit counting, then a
 * block-until-`blockExpiresAt`, then reset — but in Redis, so the limit is global
 * across every instance rather than per-process (`AUTHENTICATION.md` §9).
 *
 * The whole read-modify-write runs as one Lua script. Two round trips would race under
 * concurrent requests for the same key, which is exactly the traffic pattern a rate
 * limiter exists to survive — two requests arriving together must not both read the
 * count before either writes it back.
 */
const INCREMENT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local blockDuration = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'hits', 'expiresAt', 'blockExpiresAt', 'isBlocked')
local hits = tonumber(data[1]) or 0
local expiresAt = tonumber(data[2]) or 0
local blockExpiresAt = tonumber(data[3]) or 0
local isBlocked = data[4] == '1'

if expiresAt <= now then
  expiresAt = now + ttl
end

if not isBlocked then
  hits = hits + 1
end

if hits > limit and not isBlocked then
  isBlocked = true
  blockExpiresAt = now + blockDuration
end

if isBlocked and blockExpiresAt <= now then
  isBlocked = false
  hits = 1
  expiresAt = now + ttl
  blockExpiresAt = 0
end

redis.call('HMSET', key, 'hits', hits, 'expiresAt', expiresAt, 'blockExpiresAt', blockExpiresAt, 'isBlocked', isBlocked and '1' or '0')
redis.call('PEXPIREAT', key, math.max(expiresAt, blockExpiresAt) + 1000)

local timeToBlockExpire = 0
if isBlocked then
  timeToBlockExpire = math.ceil((blockExpiresAt - now) / 1000)
end

return {hits, math.ceil((expiresAt - now) / 1000), isBlocked and 1 or 0, timeToBlockExpire}
`;

type ScriptResult = [
  totalHits: number,
  timeToExpire: number,
  isBlocked: number,
  timeToBlockExpire: number,
];

export class RedisThrottlerStorage implements ThrottlerStorage {
  private static readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: RedisService) {}

  // ThrottlerStorage.increment's five positional parameters are @nestjs/throttler's
  // interface, called positionally by the guard; wrapping them in an options object
  // here would no longer implement it.
  // eslint-disable-next-line no-restricted-syntax
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const result = (await this.redis.client.eval(
        INCREMENT_SCRIPT,
        1,
        `throttle:${throttlerName}:${key}`,
        Date.now(),
        ttl,
        limit,
        blockDuration,
      )) as ScriptResult;

      const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = result;

      return { totalHits, timeToExpire, isBlocked: isBlocked === 1, timeToBlockExpire };
    } catch (error) {
      // Availability wins: a Redis outage must degrade rate limiting, not take every
      // throttled endpoint down with it. Logged, not silent — this is what the
      // alerting in DEPLOYMENT.md §8 watches.
      RedisThrottlerStorage.logger.error(
        `Redis throttling storage unavailable, allowing the request: ${(error as Error).message}`,
      );

      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
