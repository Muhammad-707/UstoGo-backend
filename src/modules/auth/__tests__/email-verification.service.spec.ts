import type { EventEmitter2 } from '@nestjs/event-emitter';

import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';
import type { MailService } from '@shared/mail/mail.service';

import { hashToken } from '../domain/refresh-token.util';
import { AUTH_EVENT } from '../events/auth.events';
import {
  EmailAlreadyVerifiedException,
  InvalidVerificationTokenException,
} from '../exceptions/auth.exceptions';
import { EmailVerificationService } from '../services/email-verification.service';

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const future = (): Date => new Date(Date.now() + 60_000);
const past = (): Date => new Date(Date.now() - 60_000);

const build = (options: { user?: unknown; record?: unknown; consumed?: number } = {}) => {
  const userStub =
    'user' in options ? options.user : { id: 'u1', email: 'a@b.co', emailVerifiedAt: null };

  const userDelegate = {
    findUniqueOrThrow: jest.fn().mockResolvedValue(userStub),
    update: jest.fn().mockResolvedValue({}),
  };
  const tokenDelegate = {
    findUnique: jest.fn().mockResolvedValue('record' in options ? options.record : null),
    updateMany: jest.fn().mockResolvedValue({ count: options.consumed ?? 1 }),
    create: jest.fn().mockResolvedValue({}),
  };

  const prisma = {
    db: { user: userDelegate, emailVerificationToken: tokenDelegate },
  } as unknown as PrismaService;
  const tx = {
    run: (fn: (client: unknown) => unknown) =>
      fn({ user: userDelegate, emailVerificationToken: tokenDelegate }),
  } as unknown as TransactionManager;
  const mail = { sendAndForget: jest.fn() } as unknown as MailService;
  const config = {
    jwt: { emailVerificationTtl: '24h', emailVerificationUrl: 'https://app.test/verify-email' },
  } as AppConfigService;
  const events = { emit: jest.fn() } as unknown as EventEmitter2;

  return {
    service: new EmailVerificationService(prisma, tx, mail, config, events),
    userDelegate,
    tokenDelegate,
    mail,
    events,
  };
};

describe('EmailVerificationService.issue', () => {
  it('stores only the hash of the token and emails a link', async () => {
    const { service, tokenDelegate, mail } = build();

    await service.issue({ id: 'u1', email: 'a@b.co' } as never);

    const stored = firstArg<{ data: { tokenHash: string } }>(tokenDelegate.create);
    const sent = firstArg<{ text: string }>(mail.sendAndForget as unknown as jest.Mock);
    const raw = /token=([A-Za-z0-9_-]+)/.exec(sent.text)?.[1] ?? '';

    expect(raw.length).toBeGreaterThan(0);
    expect(stored.data.tokenHash).toBe(hashToken(raw));
    expect(sent.text).toContain('https://app.test/verify-email?token=');
  });

  it('invalidates any previously issued token first', async () => {
    const { service, tokenDelegate } = build();

    await service.issue({ id: 'u1', email: 'a@b.co' } as never);

    const invalidate = firstArg<{ where: { userId: string; usedAt: null } }>(
      tokenDelegate.updateMany,
    );
    expect(invalidate.where).toMatchObject({ userId: 'u1', usedAt: null });
  });
});

describe('EmailVerificationService.resend', () => {
  it('issues a fresh token for an unverified account', async () => {
    const { service, tokenDelegate } = build();

    await service.resend('u1');

    expect(tokenDelegate.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an already-verified account', async () => {
    const { service } = build({ user: { id: 'u1', email: 'a@b.co', emailVerifiedAt: new Date() } });

    await expect(service.resend('u1')).rejects.toBeInstanceOf(EmailAlreadyVerifiedException);
  });
});

describe('EmailVerificationService.verify', () => {
  const record = { id: 'r1', userId: 'u1', usedAt: null, expiresAt: future() };

  it('marks the account verified and emits the event', async () => {
    const { service, userDelegate, events } = build({ record });

    await service.verify('raw');

    expect(userDelegate.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { emailVerifiedAt: expect.any(Date) as Date },
    });
    expect(events.emit).toHaveBeenCalledWith(AUTH_EVENT.EMAIL_VERIFIED, expect.anything());
  });

  it.each([
    ['an unknown token', { record: null }],
    ['an already used token', { record: { ...record, usedAt: new Date() } }],
    ['an expired token', { record: { ...record, expiresAt: past() } }],
  ])('rejects %s with one indistinguishable code', async (_label, options) => {
    const { service } = build(options);

    await expect(service.verify('raw')).rejects.toBeInstanceOf(InvalidVerificationTokenException);
  });

  it('rejects the loser of a concurrent verify', async () => {
    const { service } = build({ record, consumed: 0 });

    await expect(service.verify('raw')).rejects.toBeInstanceOf(InvalidVerificationTokenException);
  });
});
