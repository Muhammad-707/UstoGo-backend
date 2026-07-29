import type { RedisService } from '@shared/redis/redis.service';

import { RedisThrottlerStorage } from '../redis-throttler.storage';

const build = (eval_: jest.Mock) => {
  const redis = { client: { eval: eval_ } } as unknown as RedisService;

  return new RedisThrottlerStorage(redis);
};

describe('RedisThrottlerStorage.increment', () => {
  it('reads totalHits, timeToExpire, isBlocked and timeToBlockExpire from the script result', async () => {
    const evalMock = jest.fn().mockResolvedValue([3, 45, 1, 12]);
    const storage = build(evalMock);

    const record = await storage.increment('key-1', 60_000, 5, 60_000, 'default');

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: true,
      timeToBlockExpire: 12,
    });
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'throttle:default:key-1',
      expect.any(Number),
      60_000,
      5,
      60_000,
    );
  });

  it('reports not blocked when the script says so', async () => {
    const storage = build(jest.fn().mockResolvedValue([1, 60, 0, 0]));

    await expect(storage.increment('key-1', 60_000, 5, 60_000, 'default')).resolves.toMatchObject({
      isBlocked: false,
    });
  });

  // A Redis outage must degrade rate limiting, not take every throttled endpoint down
  // with it — availability wins over the limit being perfectly enforced for that window.
  it('fails open and allows the request when Redis is unreachable', async () => {
    const storage = build(jest.fn().mockRejectedValue(new Error('connection refused')));

    await expect(storage.increment('key-1', 60_000, 5, 60_000, 'default')).resolves.toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });
});
