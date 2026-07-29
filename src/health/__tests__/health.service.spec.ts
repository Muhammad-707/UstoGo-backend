import { HttpStatus } from '@nestjs/common';

import { DependencyUnavailableException } from '../exceptions/dependency-unavailable.exception';
import type { HealthCheckResult, HealthIndicator } from '../health-check.type';
import { HealthService } from '../health.service';
import type { DatabaseHealthIndicator } from '../indicators/database.health-indicator';
import type { StorageHealthIndicator } from '../indicators/storage.health-indicator';

const indicator = (result: HealthCheckResult, delayMs = 0): HealthIndicator => ({
  name: result.name,
  check: async () => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return result;
  },
});

const up = (name: string, latencyMs = 1): HealthCheckResult => ({ name, status: 'up', latencyMs });
const down = (name: string, reason = 'connection failed'): HealthCheckResult => ({
  name,
  status: 'down',
  latencyMs: 2000,
  reason,
});

// The service takes the two concrete indicators; the casts let each test supply a
// stub without constructing a PrismaClient or reaching the network.
const serviceWith = (database: HealthIndicator, storage: HealthIndicator): HealthService =>
  new HealthService(database as DatabaseHealthIndicator, storage as StorageHealthIndicator);

describe('HealthService.checkReadiness', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('reports every dependency when all are up', async () => {
    const service = serviceWith(indicator(up('database', 3)), indicator(up('objectStorage', 11)));

    await expect(service.checkReadiness()).resolves.toEqual({
      checks: {
        database: { status: 'up', latencyMs: 3 },
        objectStorage: { status: 'up', latencyMs: 11 },
      },
    });
  });

  it('throws a 503 when a dependency is down', async () => {
    const service = serviceWith(indicator(down('database')), indicator(up('objectStorage')));

    await expect(service.checkReadiness()).rejects.toBeInstanceOf(DependencyUnavailableException);
  });

  it('names the failing dependency in the message', async () => {
    const service = serviceWith(indicator(down('database')), indicator(up('objectStorage')));

    await expect(service.checkReadiness()).rejects.toThrow('Readiness check failed: database');
  });

  // "One dependency is down" and "everything is down" call for different responses, so
  // a single probe has to distinguish them.
  it('reports every failure, not just the first', async () => {
    const service = serviceWith(
      indicator(down('database', 'timed out after 2000ms')),
      indicator(down('objectStorage', 'unreachable')),
    );

    try {
      await service.checkReadiness();
      throw new Error('expected checkReadiness to reject');
    } catch (error) {
      const exception = error as DependencyUnavailableException;

      expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(exception.details).toEqual([
        { field: 'database', constraints: ['timed out after 2000ms'] },
        { field: 'objectStorage', constraints: ['unreachable'] },
      ]);
    }
  });

  // A serial implementation would take the sum of the timeouts, so a probe with a
  // 2s-per-check budget could exceed a load balancer's own deadline.
  it('runs the probes concurrently rather than in sequence', async () => {
    const service = serviceWith(indicator(up('database'), 60), indicator(up('objectStorage'), 60));

    const startedAt = Date.now();
    await service.checkReadiness();

    expect(Date.now() - startedAt).toBeLessThan(110);
  });

  it('omits the failure reason from the success report', async () => {
    const service = serviceWith(indicator(up('database')), indicator(up('objectStorage')));
    const { checks } = await service.checkReadiness();

    expect(checks['database']).not.toHaveProperty('reason');
  });
});
