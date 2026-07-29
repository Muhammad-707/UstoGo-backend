import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';
import type { MailService } from '@shared/mail/mail.service';

import { REVOKED_REASON } from '../constants/auth.constants';
import { hashToken } from '../domain/refresh-token.util';
import { InvalidResetTokenException } from '../exceptions/auth.exceptions';
import { PasswordResetService } from '../services/password-reset.service';
import type { PasswordService } from '../services/password.service';
import type { TokenService } from '../services/token.service';

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const future = (): Date => new Date(Date.now() + 60_000);
const past = (): Date => new Date(Date.now() - 60_000);

const build = (options: { user?: unknown; record?: unknown; consumed?: number } = {}) => {
  const userStub = 'user' in options ? options.user : { id: 'u1', email: 'a@b.co' };

  const userDelegate = {
    findFirst: jest.fn().mockResolvedValue(userStub),
    findUnique: jest.fn().mockResolvedValue(userStub),
    update: jest.fn().mockResolvedValue({}),
  };
  const resetDelegate = {
    findUnique: jest.fn().mockResolvedValue('record' in options ? options.record : null),
    updateMany: jest.fn().mockResolvedValue({ count: options.consumed ?? 1 }),
    create: jest.fn().mockResolvedValue({}),
  };

  const prisma = {
    db: { user: userDelegate, passwordResetToken: resetDelegate },
  } as unknown as PrismaService;
  const tx = {
    run: (fn: (client: unknown) => unknown) =>
      fn({ user: userDelegate, passwordResetToken: resetDelegate }),
  } as unknown as TransactionManager;
  const passwords = { hash: jest.fn().mockResolvedValue('new-hash') } as unknown as PasswordService;
  const tokens = {
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;
  const mail = { sendAndForget: jest.fn() } as unknown as MailService;
  const config = {
    jwt: { passwordResetTtl: '30m', passwordResetUrl: 'https://app.test/reset' },
  } as AppConfigService;

  return {
    service: new PasswordResetService(prisma, tx, passwords, tokens, mail, config),
    userDelegate,
    resetDelegate,
    tokens,
    mail,
  };
};

describe('PasswordResetService.requestReset', () => {
  it('issues a token and emails a link for a known address', async () => {
    const { service, resetDelegate, mail } = build();

    await service.requestReset('a@b.co');

    expect(resetDelegate.create).toHaveBeenCalledTimes(1);
    expect(mail.sendAndForget).toHaveBeenCalledTimes(1);
  });

  // Answering differently for a known address would be a free enumeration oracle,
  // which is why the endpoint returns 202 either way.
  it('does nothing at all for an unknown address', async () => {
    const { service, resetDelegate, mail } = build({ user: null });

    await expect(service.requestReset('ghost@b.co')).resolves.toBeUndefined();
    expect(resetDelegate.create).not.toHaveBeenCalled();
    expect(mail.sendAndForget).not.toHaveBeenCalled();
  });

  // A forwarded or intercepted older email must stop working the moment a fresh
  // request is made (AUTHENTICATION.md §8).
  it('invalidates any previously issued token first', async () => {
    const { service, resetDelegate } = build();

    await service.requestReset('a@b.co');
    const invalidate = firstArg<{ where: { userId: string; usedAt: null } }>(
      resetDelegate.updateMany,
    );

    expect(invalidate.where).toMatchObject({ userId: 'u1', usedAt: null });
  });

  it('stores only the hash of the token', async () => {
    const { service, resetDelegate, mail } = build();

    await service.requestReset('a@b.co');

    const stored = firstArg<{ data: { tokenHash: string } }>(resetDelegate.create);
    const sent = firstArg<{ text: string }>(mail.sendAndForget as unknown as jest.Mock);
    const raw = /token=([A-Za-z0-9_-]+)/.exec(sent.text)?.[1] ?? '';

    expect(raw.length).toBeGreaterThan(0);
    expect(stored.data.tokenHash).toBe(hashToken(raw));
    expect(stored.data.tokenHash).not.toBe(raw);
  });

  it('sends a link built from the configured reset URL', async () => {
    const { service, mail } = build();

    await service.requestReset('a@b.co');
    const sent = firstArg<{ text: string }>(mail.sendAndForget as unknown as jest.Mock);

    expect(sent.text).toContain('https://app.test/reset?token=');
  });
});

describe('PasswordResetService.resetPassword', () => {
  const record = { id: 'r1', userId: 'u1', usedAt: null, expiresAt: future() };

  it('sets the new password and revokes every session', async () => {
    const { service, userDelegate, tokens } = build({ record });

    await service.resetPassword('raw', 'newpassword9');

    expect(userDelegate.update).toHaveBeenCalledTimes(1);
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'u1',
      REVOKED_REASON.PASSWORD_RESET,
      expect.anything(),
    );
  });

  it.each([
    ['an unknown token', { record: null }],
    ['an already used token', { record: { ...record, usedAt: new Date() } }],
    ['an expired token', { record: { ...record, expiresAt: past() } }],
  ])('rejects %s with one indistinguishable code', async (_label, options) => {
    const { service } = build(options);

    await expect(service.resetPassword('raw', 'newpassword9')).rejects.toBeInstanceOf(
      InvalidResetTokenException,
    );
  });

  // Two requests carrying the same link must not both succeed.
  it('rejects the loser of a concurrent reset', async () => {
    const { service } = build({ record, consumed: 0 });

    await expect(service.resetPassword('raw', 'newpassword9')).rejects.toBeInstanceOf(
      InvalidResetTokenException,
    );
  });

  it('notifies the account that its password changed', async () => {
    const { service, mail } = build({ record });

    await service.resetPassword('raw', 'newpassword9');

    expect(mail.sendAndForget).toHaveBeenCalledTimes(1);
  });

  it('skips the notification when the account vanished mid-flight', async () => {
    const { service, userDelegate, mail } = build({ record });
    userDelegate.findUnique.mockResolvedValue(null);

    await service.resetPassword('raw', 'newpassword9');

    expect(mail.sendAndForget).not.toHaveBeenCalled();
  });
});
