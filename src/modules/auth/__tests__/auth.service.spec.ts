import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { User } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import { AUTH_EVENT } from '../events/auth.events';
import {
  AccountBlockedException,
  AccountInactiveException,
  CityNotFoundException,
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  PasswordReusedException,
  PhoneAlreadyExistsException,
} from '../exceptions/auth.exceptions';
import { AuthService } from '../services/auth.service';
import type { EmailVerificationService } from '../services/email-verification.service';
import type { PasswordService } from '../services/password.service';
import type { TokenService } from '../services/token.service';

const user = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'aziz@example.com',
    phone: null,
    passwordHash: 'hash',
    role: 'CLIENT',
    status: 'ACTIVE',
    ...overrides,
  }) as unknown as User;

/**
 * First argument of the first call, typed.
 *
 * `jest.Mock.mock.calls` is `any[][]`, so reading it directly trips the unsafe-any
 * rules at every assertion. Confining the cast here keeps the tests readable and the
 * escape hatch in one place.
 */
const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

type Stubs = {
  findFirstUser?: unknown;
  findFirstCity?: unknown;
  verify?: boolean | boolean[];
};

const build = (stubs: Stubs = {}) => {
  const verifyResults = Array.isArray(stubs.verify) ? [...stubs.verify] : null;
  const verify = jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        verifyResults !== null ? (verifyResults.shift() ?? false) : (stubs.verify ?? true),
      ),
    );
  const verifyAgainstDummy = jest.fn().mockResolvedValue(undefined);

  // `in` rather than `??`: a deliberate `null` stub — "this row does not exist" — is
  // exactly the case these tests are about, and `??` would swap it for the default.
  const userStub = 'findFirstUser' in stubs ? stubs.findFirstUser : null;
  const cityStub = 'findFirstCity' in stubs ? stubs.findFirstCity : { id: 'c1' };

  const userDelegate = {
    findFirst: jest.fn().mockResolvedValue(userStub),
    findUniqueOrThrow: jest.fn().mockResolvedValue(userStub ?? user()),
    update: jest.fn().mockResolvedValue(user()),
    create: jest.fn().mockResolvedValue(user()),
  };
  const cityDelegate = { findFirst: jest.fn().mockResolvedValue(cityStub) };
  const clientProfileDelegate = { create: jest.fn().mockResolvedValue({ id: 'cp1' }) };
  const masterProfileDelegate = { create: jest.fn().mockResolvedValue({ id: 'mp1' }) };

  const prisma = { db: { user: userDelegate, city: cityDelegate } } as unknown as PrismaService;
  const tx = {
    run: (fn: (client: unknown) => unknown) =>
      fn({
        user: userDelegate,
        clientProfile: clientProfileDelegate,
        masterProfile: masterProfileDelegate,
      }),
  } as unknown as TransactionManager;

  const passwords = {
    hash: jest.fn().mockResolvedValue('new-hash'),
    verify,
    verifyAgainstDummy,
  } as unknown as PasswordService;
  const tokens = {
    issuePair: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    revokeAllExceptFamily: jest.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  const emailVerification = {
    issue: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmailVerificationService;

  return {
    service: new AuthService(prisma, tx, passwords, tokens, events, emailVerification),
    userDelegate,
    cityDelegate,
    clientProfileDelegate,
    masterProfileDelegate,
    passwords,
    tokens,
    events,
    verifyAgainstDummy,
  };
};

const CLIENT_DTO = {
  email: 'aziz@example.com',
  password: 'correcthorse7',
  firstName: 'Aziz',
  lastName: 'Karimov',
};

describe('AuthService.registerClient', () => {
  it('creates the account and emits user.registered after commit', async () => {
    const { service, events } = build();

    const result = await service.registerClient(CLIENT_DTO, {});

    expect(result.tokens.accessToken).toBe('a');
    expect(events.emit).toHaveBeenCalledWith(AUTH_EVENT.USER_REGISTERED, expect.anything());
  });

  it('rejects a duplicate email', async () => {
    const { service } = build({ findFirstUser: { email: CLIENT_DTO.email, phone: null } });

    await expect(service.registerClient(CLIENT_DTO, {})).rejects.toBeInstanceOf(
      EmailAlreadyExistsException,
    );
  });

  it('rejects a duplicate phone', async () => {
    const { service } = build({
      findFirstUser: { email: 'someone@else.com', phone: '+998901234567' },
    });

    await expect(
      service.registerClient({ ...CLIENT_DTO, phone: '+998901234567' }, {}),
    ).rejects.toBeInstanceOf(PhoneAlreadyExistsException);
  });

  it('rejects an unknown city', async () => {
    const { service } = build({ findFirstCity: null });

    await expect(
      service.registerClient({ ...CLIENT_DTO, cityId: 'missing' }, {}),
    ).rejects.toBeInstanceOf(CityNotFoundException);
  });

  it('does not look up a city when none was supplied', async () => {
    const { service, cityDelegate } = build();

    await service.registerClient(CLIENT_DTO, {});

    expect(cityDelegate.findFirst).not.toHaveBeenCalled();
  });

  it('attaches the city when one was supplied and exists', async () => {
    const { service, clientProfileDelegate } = build();

    await service.registerClient({ ...CLIENT_DTO, cityId: 'c1' }, {});

    const created = firstArg<{ data: { cityId?: string } }>(clientProfileDelegate.create);
    expect(created.data.cityId).toBe('c1');
  });

  // The role is a literal in the service, never read from the payload.
  it('always creates a CLIENT', async () => {
    const { service, userDelegate } = build();

    await service.registerClient(CLIENT_DTO, {});
    const created = firstArg<{ data: { role: string } }>(userDelegate.create);

    expect(created.data.role).toBe('CLIENT');
  });
});

describe('AuthService.registerMaster', () => {
  const MASTER_DTO = {
    ...CLIENT_DTO,
    phone: '+998901234567',
    cityId: 'c1',
    displayName: 'Aziz Plumbing',
    timezone: 'Asia/Tashkent',
  };

  it('creates a MASTER and emits master.registered', async () => {
    const { service, userDelegate, events } = build();

    await service.registerMaster(MASTER_DTO, {});
    const created = firstArg<{ data: { role: string } }>(userDelegate.create);

    expect(created.data.role).toBe('MASTER');
    expect(events.emit).toHaveBeenCalledWith(AUTH_EVENT.MASTER_REGISTERED, expect.anything());
  });

  it('requires the city to exist', async () => {
    const { service } = build({ findFirstCity: null });

    await expect(service.registerMaster(MASTER_DTO, {})).rejects.toBeInstanceOf(
      CityNotFoundException,
    );
  });

  it('omits bio and years of experience when neither was supplied', async () => {
    const { service, masterProfileDelegate } = build();

    await service.registerMaster(MASTER_DTO, {});

    const created = firstArg<{ data: Record<string, unknown> }>(masterProfileDelegate.create);
    expect(created.data).not.toHaveProperty('bio');
    expect(created.data).not.toHaveProperty('yearsOfExperience');
  });

  it('attaches bio and years of experience when supplied', async () => {
    const { service, masterProfileDelegate } = build();

    await service.registerMaster({ ...MASTER_DTO, bio: 'Plumber', yearsOfExperience: 5 }, {});

    const created = firstArg<{ data: { bio?: string; yearsOfExperience?: number } }>(
      masterProfileDelegate.create,
    );
    expect(created.data.bio).toBe('Plumber');
    expect(created.data.yearsOfExperience).toBe(5);
  });
});

describe('AuthService.login', () => {
  it('returns tokens for correct credentials', async () => {
    const { service } = build({ findFirstUser: user(), verify: true });

    await expect(service.login('aziz@example.com', 'correcthorse7', {})).resolves.toMatchObject({
      tokens: { accessToken: 'a' },
    });
  });

  it('rejects a wrong password', async () => {
    const { service } = build({ findFirstUser: user(), verify: false });

    await expect(service.login('aziz@example.com', 'nope', {})).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('rejects an unknown email with the same exception', async () => {
    const { service } = build({ findFirstUser: null });

    await expect(service.login('ghost@example.com', 'nope', {})).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  // Without this the unknown-email path would return measurably faster than the
  // wrong-password path, and latency alone would reveal which addresses exist.
  it('burns a dummy comparison when the user does not exist', async () => {
    const { service, verifyAgainstDummy } = build({ findFirstUser: null });

    await expect(service.login('ghost@example.com', 'nope', {})).rejects.toThrow();
    expect(verifyAgainstDummy).toHaveBeenCalledWith('nope');
  });

  it.each([
    ['BLOCKED', AccountBlockedException],
    ['INACTIVE', AccountInactiveException],
  ])('reports %s only after the password verifies', async (status, expected) => {
    const { service } = build({
      findFirstUser: user({ status: status as User['status'] }),
      verify: true,
    });

    await expect(service.login('aziz@example.com', 'correcthorse7', {})).rejects.toBeInstanceOf(
      expected,
    );
  });

  // Checking status before the password would turn ACCOUNT_BLOCKED into a signal that
  // the address is registered, which is the oracle the identical 401 exists to close.
  it('reports invalid credentials, not the account state, for a blocked user with a wrong password', async () => {
    const { service } = build({ findFirstUser: user({ status: 'BLOCKED' }), verify: false });

    await expect(service.login('aziz@example.com', 'nope', {})).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('records the login timestamp', async () => {
    const { service, userDelegate } = build({ findFirstUser: user(), verify: true });

    await service.login('aziz@example.com', 'correcthorse7', {});

    const updated = firstArg<{ data: { lastLoginAt: Date } }>(userDelegate.update);

    expect(updated.data.lastLoginAt).toBeInstanceOf(Date);
  });
});

describe('AuthService.changePassword', () => {
  it('rejects a wrong current password', async () => {
    const { service } = build({ findFirstUser: user(), verify: [false] });

    await expect(
      service.changePassword('user-1', 'fam', 'wrong', 'newpassword9'),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('rejects a new password equal to the current one', async () => {
    const { service } = build({ findFirstUser: user(), verify: [true, true] });

    await expect(
      service.changePassword('user-1', 'fam', 'correcthorse7', 'correcthorse7'),
    ).rejects.toBeInstanceOf(PasswordReusedException);
  });

  it('revokes every other session but keeps the caller’s', async () => {
    const { service, tokens } = build({ findFirstUser: user(), verify: [true, false] });

    await service.changePassword('user-1', 'keep-me', 'correcthorse7', 'newpassword9');

    expect(tokens.revokeAllExceptFamily).toHaveBeenCalledWith(
      'user-1',
      'keep-me',
      'PASSWORD_CHANGED',
      expect.anything(),
    );
  });
});
