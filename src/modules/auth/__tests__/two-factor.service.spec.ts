import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import { encryptSecret } from '../domain/secret-encryption.util';
import { generateTotpSecret, totp } from '../domain/totp.util';
import {
  InvalidTotpCodeException,
  InvalidTwoFactorChallengeException,
  TotpAlreadyEnabledException,
  TotpNotEnabledException,
  TotpSetupNotStartedException,
} from '../exceptions/auth.exceptions';
import type { TokenService } from '../services/token.service';
import { TwoFactorService } from '../services/two-factor.service';

const KEY = 'a'.repeat(64); // 32 bytes hex
const SECRET = generateTotpSecret();

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;
const future = (): Date => new Date(Date.now() + 60_000);
const past = (): Date => new Date(Date.now() - 60_000);

const build = (options: { user?: unknown; challenge?: unknown; consumed?: number } = {}) => {
  const userStub =
    'user' in options
      ? options.user
      : {
          id: 'u1',
          email: 'admin@ustogo.tj',
          totpSecret: encryptSecret(SECRET, KEY),
          totpEnabledAt: null,
        };

  const userDelegate = {
    findUniqueOrThrow: jest.fn().mockResolvedValue(userStub),
    update: jest.fn().mockResolvedValue({}),
  };
  const challengeDelegate = {
    findUnique: jest.fn().mockResolvedValue('challenge' in options ? options.challenge : null),
    updateMany: jest.fn().mockResolvedValue({ count: options.consumed ?? 1 }),
    create: jest.fn().mockResolvedValue({}),
  };

  const prisma = {
    db: { user: userDelegate, twoFactorChallenge: challengeDelegate },
  } as unknown as PrismaService;
  const tx = {
    run: (fn: (client: unknown) => unknown) =>
      fn({ user: userDelegate, twoFactorChallenge: challengeDelegate }),
  } as unknown as TransactionManager;
  const tokens = {
    issuePair: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
  } as unknown as TokenService;
  const config = {
    jwt: { totpEncryptionKey: KEY, totpIssuer: 'UstoGo', twoFactorChallengeTtl: '5m' },
  } as AppConfigService;

  return {
    service: new TwoFactorService(prisma, tx, tokens, config),
    userDelegate,
    challengeDelegate,
    tokens,
  };
};

describe('TwoFactorService.setup', () => {
  it('stores an encrypted secret and returns the plaintext once', async () => {
    const { service, userDelegate } = build({
      user: { id: 'u1', email: 'admin@ustogo.tj', totpSecret: null, totpEnabledAt: null },
    });

    const result = await service.setup('u1');

    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    expect(result.otpauthUrl).toContain('admin%40ustogo.tj');

    const stored = firstArg<{ data: { totpSecret: string } }>(userDelegate.update);
    expect(stored.data.totpSecret).not.toBe(result.secret);
  });

  it('rejects setup for an already-enabled account', async () => {
    const { service } = build({
      user: { id: 'u1', email: 'a@b.co', totpSecret: 'x', totpEnabledAt: new Date() },
    });

    await expect(service.setup('u1')).rejects.toBeInstanceOf(TotpAlreadyEnabledException);
  });
});

describe('TwoFactorService.enable', () => {
  it('enables on a correct code', async () => {
    const { service, userDelegate } = build();

    await service.enable('u1', totp(SECRET));

    const updated = firstArg<{ data: { totpEnabledAt: Date } }>(userDelegate.update);
    expect(updated.data.totpEnabledAt).toBeInstanceOf(Date);
  });

  it('rejects a wrong code', async () => {
    const { service } = build();

    await expect(service.enable('u1', '000000')).rejects.toBeInstanceOf(InvalidTotpCodeException);
  });

  it('rejects enabling without a prior setup', async () => {
    const { service } = build({
      user: { id: 'u1', email: 'a@b.co', totpSecret: null, totpEnabledAt: null },
    });

    await expect(service.enable('u1', '123456')).rejects.toBeInstanceOf(
      TotpSetupNotStartedException,
    );
  });

  it('rejects enabling an already-enabled account', async () => {
    const { service } = build({
      user: {
        id: 'u1',
        email: 'a@b.co',
        totpSecret: encryptSecret(SECRET, KEY),
        totpEnabledAt: new Date(),
      },
    });

    await expect(service.enable('u1', totp(SECRET))).rejects.toBeInstanceOf(
      TotpAlreadyEnabledException,
    );
  });
});

describe('TwoFactorService.disable', () => {
  const enabledUser = {
    id: 'u1',
    email: 'a@b.co',
    totpSecret: encryptSecret(SECRET, KEY),
    totpEnabledAt: new Date(),
  };

  it('disables on a correct code', async () => {
    const { service, userDelegate } = build({ user: enabledUser });

    await service.disable('u1', totp(SECRET));

    const updated = firstArg<{ data: { totpSecret: null; totpEnabledAt: null } }>(
      userDelegate.update,
    );
    expect(updated.data).toEqual({ totpSecret: null, totpEnabledAt: null });
  });

  it('rejects a wrong code', async () => {
    const { service } = build({ user: enabledUser });

    await expect(service.disable('u1', '000000')).rejects.toBeInstanceOf(InvalidTotpCodeException);
  });

  it('rejects disabling an account without 2FA', async () => {
    const { service } = build({
      user: { id: 'u1', email: 'a@b.co', totpSecret: null, totpEnabledAt: null },
    });

    await expect(service.disable('u1', '123456')).rejects.toBeInstanceOf(TotpNotEnabledException);
  });
});

describe('TwoFactorService.verifyChallenge', () => {
  const userRow = {
    id: 'u1',
    email: 'a@b.co',
    totpSecret: encryptSecret(SECRET, KEY),
    totpEnabledAt: new Date(),
  };
  const challenge = { id: 'c1', userId: 'u1', usedAt: null, expiresAt: future(), user: userRow };

  it('issues a token pair on a valid challenge and code', async () => {
    const { service, tokens } = build({ challenge });

    const result = await service.verifyChallenge('raw', totp(SECRET), {});

    expect(result.tokens.accessToken).toBe('a');
    expect(tokens.issuePair).toHaveBeenCalledWith(userRow, {});
  });

  it.each([
    ['an unknown challenge', { challenge: null }],
    ['an already-used challenge', { challenge: { ...challenge, usedAt: new Date() } }],
    ['an expired challenge', { challenge: { ...challenge, expiresAt: past() } }],
  ])('rejects %s', async (_label, options) => {
    const { service } = build(options);

    await expect(service.verifyChallenge('raw', totp(SECRET), {})).rejects.toBeInstanceOf(
      InvalidTwoFactorChallengeException,
    );
  });

  it('rejects a valid challenge with a wrong code', async () => {
    const { service } = build({ challenge });

    await expect(service.verifyChallenge('raw', '000000', {})).rejects.toBeInstanceOf(
      InvalidTotpCodeException,
    );
  });

  it('rejects the loser of a concurrent verify', async () => {
    const { service } = build({ challenge, consumed: 0 });

    await expect(service.verifyChallenge('raw', totp(SECRET), {})).rejects.toBeInstanceOf(
      InvalidTwoFactorChallengeException,
    );
  });
});
