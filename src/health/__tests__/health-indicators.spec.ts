import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { withTimeout } from '../health-check.type';
import { DatabaseHealthIndicator } from '../indicators/database.health-indicator';
import { StorageHealthIndicator } from '../indicators/storage.health-indicator';

describe('withTimeout', () => {
  it('resolves when the operation finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 100)).resolves.toBe('done');
  });

  it('rejects when the operation outlives the budget', async () => {
    const never = new Promise((resolve) => setTimeout(resolve, 500));

    await expect(withTimeout(never, 20)).rejects.toThrow('timed out after 20ms');
  });

  it('propagates the operation’s own failure unchanged', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 100)).rejects.toThrow('boom');
  });

  // Without clearing the timer the process keeps a pending handle per check, and a
  // probe running every few seconds would stop the process from exiting cleanly.
  it('clears its timer so a completed check leaves no pending handle', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');

    await withTimeout(Promise.resolve('done'), 1000);

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe('DatabaseHealthIndicator', () => {
  const indicatorWith = (queryRaw: jest.Mock): DatabaseHealthIndicator =>
    new DatabaseHealthIndicator({ $queryRaw: queryRaw } as unknown as PrismaService);

  it('reports up when the query succeeds', async () => {
    const result = await indicatorWith(jest.fn().mockResolvedValue([{ '?column?': 1 }])).check();

    expect(result).toMatchObject({ name: 'database', status: 'up' });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports down when the query fails', async () => {
    const result = await indicatorWith(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    ).check();

    expect(result).toMatchObject({ name: 'database', status: 'down' });
  });

  // A driver error quotes the host, port, user and database name. The readiness body
  // is reachable by anything that can reach the probe.
  it('never leaks the underlying error into the reason', async () => {
    const result = await indicatorWith(
      jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 user=ustogo')),
    ).check();

    expect(result.reason).toBe('connection failed');
    expect(JSON.stringify(result)).not.toContain('10.0.0.5');
  });

  it('does not throw — a failing probe must still report', async () => {
    await expect(
      indicatorWith(jest.fn().mockRejectedValue(new Error('x'))).check(),
    ).resolves.toBeDefined();
  });
});

describe('StorageHealthIndicator', () => {
  const config = { storage: { endpoint: 'http://localhost:9010' } } as AppConfigService;
  const indicator = new StorageHealthIndicator(config);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports up on a successful response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    expect(await indicator.check()).toMatchObject({ name: 'objectStorage', status: 'up' });
  });

  // S3 answers an unsigned request with 403. A 403 proves the service is alive, which
  // is exactly what this indicator claims to check.
  it('treats a 403 as up, because the endpoint answered', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));

    expect(await indicator.check()).toMatchObject({ status: 'up' });
  });

  it('reports down when the endpoint is unreachable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));

    expect(await indicator.check()).toMatchObject({ status: 'down', reason: 'unreachable' });
  });

  it('distinguishes a timeout from an unreachable host', async () => {
    const timeout = new Error('The operation was aborted');
    timeout.name = 'TimeoutError';
    jest.spyOn(global, 'fetch').mockRejectedValue(timeout);

    expect(await indicator.check()).toMatchObject({ status: 'down', reason: 'timed out' });
  });

  it('does not throw — a failing probe must still report', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('x'));

    await expect(indicator.check()).resolves.toBeDefined();
  });
});
