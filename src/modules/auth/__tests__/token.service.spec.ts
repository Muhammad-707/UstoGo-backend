import type { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';

import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import { REVOKED_REASON } from '../constants/auth.constants';
import { hashToken } from '../domain/refresh-token.util';
import {
  InvalidRefreshTokenException,
  RefreshTokenReusedException,
  SessionNotFoundException,
} from '../exceptions/auth.exceptions';
import { TokenService } from '../services/token.service';

// Only the fields TokenService reads; the cast avoids restating every column of User.
const USER = {
  id: 'user-1',
  email: 'a@b.co',
  role: 'CLIENT',
  status: 'ACTIVE',
} as unknown as User;

/**
 * First argument of the first call, typed.
 *
 * `jest.Mock.mock.calls` is `any[][]`, so reading it directly trips the unsafe-any
 * rules at every assertion. Confining the cast here keeps the tests readable and the
 * escape hatch in one place.
 */
const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const future = (): Date => new Date(Date.now() + 3_600_000);
const past = (): Date => new Date(Date.now() - 1_000);

type Harness = {
  service: TokenService;
  findUnique: jest.Mock;
  updateMany: jest.Mock;
  create: jest.Mock;
};

const harness = (token: unknown, updateCount = 1): Harness => {
  const findUnique = jest.fn().mockResolvedValue(token);
  const updateMany = jest.fn().mockResolvedValue({ count: updateCount });
  const create = jest.fn().mockResolvedValue({});

  const refreshToken = { findUnique, updateMany, create };
  const prisma = { db: { refreshToken } } as unknown as PrismaService;
  const tx = {
    run: (fn: (client: unknown) => unknown) => fn({ refreshToken }),
  } as unknown as TransactionManager;
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt') } as unknown as JwtService;
  const config = {
    jwt: { accessTtl: '15m', refreshTtl: '30d' },
  } as AppConfigService;

  return { service: new TokenService(prisma, tx, jwt, config), findUnique, updateMany, create };
};

describe('TokenService.issuePair', () => {
  it('returns a signed access token and a raw refresh token', async () => {
    const { service, create } = harness(null);

    const pair = await service.issuePair(USER);

    expect(pair.accessToken).toBe('signed.jwt');
    expect(pair.refreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.expiresIn).toBe(900);
    expect(create).toHaveBeenCalledTimes(1);
  });

  // A database dump must not yield usable sessions.
  it('stores the hash, never the raw token', async () => {
    const { service, create } = harness(null);

    const pair = await service.issuePair(USER);
    const stored = firstArg<{ data: { tokenHash: string } }>(create);

    expect(stored.data.tokenHash).toBe(hashToken(pair.refreshToken));
    expect(JSON.stringify(stored)).not.toContain(pair.refreshToken);
  });

  it('records the forensic context when supplied', async () => {
    const { service, create } = harness(null);

    await service.issuePair(USER, { deviceId: 'd1', userAgent: 'ua', ipAddress: '10.0.0.1' });
    const stored = firstArg<{ data: Record<string, unknown> }>(create);

    expect(stored.data).toMatchObject({ deviceId: 'd1', userAgent: 'ua', ipAddress: '10.0.0.1' });
  });

  it('omits absent context rather than writing undefined', async () => {
    const { service, create } = harness(null);

    await service.issuePair(USER);
    const stored = firstArg<{ data: Record<string, unknown> }>(create);

    expect(stored.data).not.toHaveProperty('deviceId');
  });
});

describe('TokenService.rotate', () => {
  const live = {
    id: 't1',
    userId: USER.id,
    familyId: 'fam-1',
    usedAt: null,
    revokedAt: null,
    expiresAt: future(),
    user: USER,
  };

  it('issues a successor in the same family', async () => {
    const { service, create } = harness(live);

    const { tokens } = await service.rotate('raw');
    const stored = firstArg<{ data: { familyId: string } }>(create);

    expect(tokens.accessToken).toBe('signed.jwt');
    expect(stored.data.familyId).toBe('fam-1');
  });

  it('marks the consumed token rotated rather than deleting it', async () => {
    const { service, updateMany } = harness(live);

    await service.rotate('raw');
    const consume = firstArg<{ data: { revokedReason: string } }>(updateMany);

    expect(consume.data.revokedReason).toBe(REVOKED_REASON.ROTATION);
  });

  it('rejects an unknown token', async () => {
    const { service } = harness(null);

    await expect(service.rotate('raw')).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('rejects an expired token', async () => {
    const { service } = harness({ ...live, expiresAt: past() });

    await expect(service.rotate('raw')).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  it('rejects a token revoked by logout', async () => {
    const { service } = harness({ ...live, revokedAt: new Date() });

    await expect(service.rotate('raw')).rejects.toBeInstanceOf(InvalidRefreshTokenException);
  });

  describe('reuse detection', () => {
    // Rotation marks the consumed row both used *and* revoked. Checking revoked first
    // classified every replay as merely invalid and the family was never revoked —
    // reuse detection was dead code until this ordering was fixed.
    const consumed = { ...live, usedAt: new Date(), revokedAt: new Date() };

    it('reports reuse for a token that was already consumed', async () => {
      const { service } = harness(consumed);

      await expect(service.rotate('raw')).rejects.toBeInstanceOf(RefreshTokenReusedException);
    });

    it('revokes the whole family, not just the presented token', async () => {
      const { service, updateMany } = harness(consumed);

      await expect(service.rotate('raw')).rejects.toBeInstanceOf(RefreshTokenReusedException);

      const revoke = firstArg<{
        where: { familyId: string };
        data: { revokedReason: string };
      }>(updateMany);

      expect(revoke.where.familyId).toBe('fam-1');
      expect(revoke.data.revokedReason).toBe(REVOKED_REASON.REUSE_DETECTED);
    });

    it('takes precedence over the revoked check, whatever the ordering of flags', async () => {
      const { service } = harness({
        ...live,
        usedAt: new Date(),
        revokedAt: new Date(),
        expiresAt: past(),
      });

      await expect(service.rotate('raw')).rejects.toBeInstanceOf(RefreshTokenReusedException);
    });
  });

  // Two concurrent refreshes of the same token must leave exactly one successor. The
  // loser is not treated as reuse: revoking the family would also revoke the token the
  // winner just received, leaving zero working sessions.
  it('fails the loser of a concurrent refresh without revoking the family', async () => {
    const { service, updateMany } = harness(live, 0);

    await expect(service.rotate('raw')).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const call = firstArg<{ data: { revokedReason: string } }>(updateMany);
    expect(call.data.revokedReason).not.toBe(REVOKED_REASON.REUSE_DETECTED);
  });
});

describe('TokenService revocation', () => {
  it('revokes only live rows on logout, so it is idempotent', async () => {
    const { service, updateMany } = harness(null);

    await service.revokeByRawToken('raw');
    const call = firstArg<{ where: Record<string, unknown> }>(updateMany);

    expect(call.where).toMatchObject({ tokenHash: hashToken('raw'), revokedAt: null });
  });

  it('revokes every session of a user', async () => {
    const { service, updateMany } = harness(null);

    await service.revokeAllForUser('user-1', REVOKED_REASON.PASSWORD_RESET);
    const call = firstArg<{ where: Record<string, unknown> }>(updateMany);

    expect(call.where).toMatchObject({ userId: 'user-1', revokedAt: null });
  });

  // Password change keeps the caller signed in on the device they changed it from.
  it('spares one family when changing a password', async () => {
    const { service, updateMany } = harness(null);

    await service.revokeAllExceptFamily('user-1', 'keep-me', REVOKED_REASON.PASSWORD_CHANGED);
    const call = firstArg<{ where: { familyId: { not: string } } }>(updateMany);

    expect(call.where.familyId).toEqual({ not: 'keep-me' });
  });
});

const sessionsHarness = (rows: unknown[], owned: unknown = { id: 'row-1' }) => {
  const findMany = jest.fn().mockResolvedValue(rows);
  const findFirst = jest.fn().mockResolvedValue(owned);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });

  const refreshToken = { findMany, findFirst, updateMany };
  const prisma = { db: { refreshToken } } as unknown as PrismaService;
  const tx = {
    run: (fn: (client: unknown) => unknown) => fn({ refreshToken }),
  } as unknown as TransactionManager;
  const jwt = {} as unknown as JwtService;
  const config = { jwt: { accessTtl: '15m', refreshTtl: '30d' } } as AppConfigService;

  return {
    service: new TokenService(prisma, tx, jwt, config),
    findMany,
    findFirst,
    updateMany,
  };
};

describe('TokenService.listSessions', () => {
  const older = {
    familyId: 'fam-old',
    deviceId: 'd1',
    userAgent: 'ua-1',
    ipAddress: '10.0.0.1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  const olderRotated = { ...older, createdAt: new Date('2026-01-02T00:00:00Z') };
  const newer = {
    familyId: 'fam-new',
    deviceId: 'd2',
    userAgent: 'ua-2',
    ipAddress: '10.0.0.2',
    createdAt: new Date('2026-01-03T00:00:00Z'),
  };

  it('folds rotated rows into one session per family, oldest as createdAt and newest as lastActiveAt', async () => {
    const { service } = sessionsHarness([older, olderRotated, newer]);

    const sessions = await service.listSessions('user-1', 'fam-new');

    const oldSession = sessions.find((s) => s.id === 'fam-old');
    expect(oldSession?.createdAt).toEqual(older.createdAt);
    expect(oldSession?.lastActiveAt).toEqual(olderRotated.createdAt);
  });

  it('marks the caller-supplied family as current and orders most recently active first', async () => {
    const { service } = sessionsHarness([older, olderRotated, newer]);

    const sessions = await service.listSessions('user-1', 'fam-new');

    expect(sessions[0]?.id).toBe('fam-new');
    expect(sessions[0]?.current).toBe(true);
    expect(sessions[1]?.current).toBe(false);
  });

  it('only queries live, unexpired rows for this user', async () => {
    const { service, findMany } = sessionsHarness([]);

    await service.listSessions('user-1', 'fam-new');
    const call = firstArg<{ where: Record<string, unknown> }>(findMany);

    expect(call.where).toMatchObject({ userId: 'user-1', revokedAt: null });
    expect(call.where.expiresAt).toBeDefined();
  });
});

describe('TokenService.revokeSession', () => {
  it('revokes the family once ownership is confirmed', async () => {
    const { service, updateMany } = sessionsHarness([], { id: 'row-1' });

    await service.revokeSession('user-1', 'fam-1');
    const call = firstArg<{ where: Record<string, unknown> }>(updateMany);

    expect(call.where).toMatchObject({ familyId: 'fam-1', revokedAt: null });
  });

  it('rejects a family that does not belong to the caller', async () => {
    const { service, updateMany } = sessionsHarness([], null);

    await expect(service.revokeSession('user-1', 'fam-1')).rejects.toBeInstanceOf(
      SessionNotFoundException,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });
});
