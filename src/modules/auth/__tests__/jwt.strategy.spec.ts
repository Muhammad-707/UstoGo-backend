import { UnauthorizedException } from '@nestjs/common';

import type { JwtPayload } from '@common/types/jwt-payload.type';
import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { JwtStrategy } from '../strategies/jwt.strategy';

const CONFIG = {
  jwt: {
    accessPublicKey: 'x'.repeat(64),
    issuer: 'ustogo-api',
    audience: 'ustogo-clients',
  },
} as AppConfigService;

const PAYLOAD: JwtPayload = {
  sub: 'user-1',
  role: 'CLIENT',
  status: 'ACTIVE',
  sid: 'fam-1',
};

const build = (found: unknown) => {
  const findUnique = jest.fn().mockResolvedValue(found);
  const prisma = { db: { user: { findUnique } } } as unknown as PrismaService;

  return { strategy: new JwtStrategy(CONFIG, prisma), findUnique };
};

describe('JwtStrategy.validate', () => {
  it('resolves an active user', async () => {
    const { strategy } = build({
      id: 'user-1',
      email: 'a@b.co',
      role: 'CLIENT',
      status: 'ACTIVE',
    });

    await expect(strategy.validate(PAYLOAD)).resolves.toEqual({
      id: 'user-1',
      email: 'a@b.co',
      role: 'CLIENT',
      sessionId: 'fam-1',
    });
  });

  // The token's own claims are a fast path, not evidence: both role and status can
  // change during a token's 15-minute life, so the account is re-read every request.
  it('reads the account rather than trusting the claims', async () => {
    const { strategy, findUnique } = build({
      id: 'user-1',
      email: 'a@b.co',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const result = await strategy.validate({ ...PAYLOAD, role: 'CLIENT' });

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(result.role).toBe('ADMIN');
  });

  // The soft-delete extension applies to this read, so a deleted account simply does
  // not resolve — there is no deletedAt check to forget.
  it('rejects a token whose user no longer resolves', async () => {
    const { strategy } = build(null);

    await expect(strategy.validate(PAYLOAD)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['BLOCKED', 'INACTIVE'])('rejects a %s account immediately', async (status) => {
    const { strategy } = build({ id: 'user-1', email: 'a@b.co', role: 'CLIENT', status });

    await expect(strategy.validate(PAYLOAD)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // The caller learns their token stopped working, not whether the account was
  // deleted, blocked or merely deactivated.
  it('does not reveal which of those it was', async () => {
    const deleted = build(null);
    const blocked = build({ id: 'u', email: 'a@b.co', role: 'CLIENT', status: 'BLOCKED' });

    const [a, b] = await Promise.all([
      deleted.strategy.validate(PAYLOAD).catch((e: Error) => e.message),
      blocked.strategy.validate(PAYLOAD).catch((e: Error) => e.message),
    ]);

    expect(a).toBe(b);
  });

  it('never selects the password hash', async () => {
    const { strategy, findUnique } = build({
      id: 'user-1',
      email: 'a@b.co',
      role: 'CLIENT',
      status: 'ACTIVE',
    });

    await strategy.validate(PAYLOAD);
    const query = (findUnique.mock.calls[0] as unknown[])[0] as { select: Record<string, boolean> };

    expect(query.select).not.toHaveProperty('passwordHash');
  });
});
