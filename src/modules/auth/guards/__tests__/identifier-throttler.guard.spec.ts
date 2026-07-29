import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';

import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  THROTTLE_IDENTIFIER_KEY,
  type ThrottleIdentifierStrategy,
} from '../../decorators/throttle-identifier.decorator';
import { hashToken } from '../../domain/refresh-token.util';
import { IdentifierThrottlerGuard } from '../identifier-throttler.guard';

const contextFor = (strategy?: ThrottleIdentifierStrategy): ExecutionContext => {
  const handler = function handler(): void {
    /* stand-in for a route handler */
  };
  if (strategy !== undefined) {
    Reflect.defineMetadata(THROTTLE_IDENTIFIER_KEY, strategy, handler);
  }
  class FakeController {}

  return {
    getHandler: () => handler,
    getClass: () => FakeController,
  } as unknown as ExecutionContext;
};

const build = (findUnique: jest.Mock = jest.fn().mockResolvedValue(null)) => {
  const prisma = { db: { refreshToken: { findUnique } } } as unknown as PrismaService;
  const options = { throttlers: [] } as unknown as ThrottlerModuleOptions;
  const storage = { increment: jest.fn() } as unknown as ThrottlerStorage;

  return new IdentifierThrottlerGuard(options, storage, new Reflector(), prisma);
};

describe('IdentifierThrottlerGuard.getTracker', () => {
  it('falls back to the base IP tracker when called without a context', async () => {
    const guard = build();

    await expect(guard['getTracker']({ ip: '1.2.3.4' })).resolves.toBe('1.2.3.4');
  });

  it('falls back to the base IP tracker for a route with no @ThrottleIdentifier', async () => {
    const guard = build();

    await expect(guard['getTracker']({ ip: '1.2.3.4' }, contextFor())).resolves.toBe('1.2.3.4');
  });

  it('composes ip:email for the ip-email strategy', async () => {
    const guard = build();
    const req = { ip: '1.2.3.4', body: { email: 'Aziz@Example.com' } };

    await expect(guard['getTracker'](req, contextFor('ip-email'))).resolves.toBe(
      '1.2.3.4:aziz@example.com',
    );
  });

  it('uses the email alone for the email strategy', async () => {
    const guard = build();
    const req = { ip: '1.2.3.4', body: { email: 'aziz@example.com' } };

    await expect(guard['getTracker'](req, contextFor('email'))).resolves.toBe('aziz@example.com');
  });

  it('falls back to IP for the email strategy when the body has none', async () => {
    const guard = build();
    const req = { ip: '1.2.3.4', body: {} };

    await expect(guard['getTracker'](req, contextFor('email'))).resolves.toBe('1.2.3.4');
  });

  it('resolves the token owner for the refresh-user strategy', async () => {
    const findUnique = jest.fn().mockResolvedValue({ userId: 'user-1' });
    const guard = build(findUnique);
    const req = { ip: '1.2.3.4', body: { refreshToken: 'raw-token' } };

    await expect(guard['getTracker'](req, contextFor('refresh-user'))).resolves.toBe('user-1');
    expect(findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw-token') },
      select: { userId: true },
    });
  });

  it('falls back to IP for refresh-user when the token is missing from the body', async () => {
    const guard = build();
    const req = { ip: '1.2.3.4', body: {} };

    await expect(guard['getTracker'](req, contextFor('refresh-user'))).resolves.toBe('1.2.3.4');
  });

  it('falls back to IP for refresh-user when the token is unknown', async () => {
    const guard = build(jest.fn().mockResolvedValue(null));
    const req = { ip: '1.2.3.4', body: { refreshToken: 'ghost-token' } };

    await expect(guard['getTracker'](req, contextFor('refresh-user'))).resolves.toBe('1.2.3.4');
  });
});
