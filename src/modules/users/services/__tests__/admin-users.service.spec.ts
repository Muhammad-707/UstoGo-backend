import { UserStatus } from '@prisma/client';

import type { TokenService } from '@modules/auth/services/token.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import {
  UserAlreadyInStatusException,
  UserNotFoundException,
} from '../../exceptions/users.exceptions';
import { AdminUsersService } from '../admin-users.service';

const USER = {
  id: 'user-1',
  email: 'a@example.com',
  phone: null,
  role: 'CLIENT',
  status: UserStatus.ACTIVE,
  createdAt: new Date(),
  lastLoginAt: null,
  clientProfile: {
    id: 'cp-1',
    firstName: 'A',
    lastName: 'B',
    cityId: null,
    avatarFileId: null,
    defaultAddress: null,
  },
  masterProfile: null,
};

const build = (overrides: { user?: Partial<Record<string, jest.Mock>> } = {}) => {
  const userDelegate = {
    findMany: jest.fn().mockResolvedValue([USER]),
    count: jest.fn().mockResolvedValue(1),
    findUnique: jest.fn().mockResolvedValue(USER),
    update: jest.fn().mockResolvedValue(USER),
    ...overrides.user,
  };
  const prisma = {
    db: { user: userDelegate },
  } as unknown as PrismaService;

  const tokens = {
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma.db)),
  } as unknown as TransactionManager;

  return {
    prisma,
    userDelegate,
    tokens,
    service: new AdminUsersService(prisma, tokens, transactionManager),
  };
};

describe('AdminUsersService.list', () => {
  it('combines role/status/city/search/date filters with AND', async () => {
    const { service, userDelegate } = build();

    await service.list({
      page: 1,
      limit: 20,
      skip: 0,
      role: 'CLIENT',
      status: UserStatus.ACTIVE,
      cityId: 'city-1',
      search: 'ali',
      registeredFrom: '2026-01-01T00:00:00.000Z',
    });

    const { where } = userDelegate.findMany.mock.calls[0][0] as {
      where: { AND: unknown[] };
    };
    expect(where.AND).toHaveLength(5);
  });

  it('returns an unfiltered query when no filters are given', async () => {
    const { service, userDelegate } = build();

    await service.list({ page: 1, limit: 20, skip: 0 });

    const { where } = userDelegate.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where).toEqual({});
  });
});

describe('AdminUsersService.getById', () => {
  it('throws UserNotFoundException for an unknown id', async () => {
    const { service } = build({ user: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.getById('ghost')).rejects.toThrow(UserNotFoundException);
  });
});

describe('AdminUsersService.block', () => {
  it('throws UserAlreadyInStatusException when already blocked', async () => {
    const { service } = build({
      user: { findUnique: jest.fn().mockResolvedValue({ ...USER, status: UserStatus.BLOCKED }) },
    });

    await expect(service.block('user-1')).rejects.toThrow(UserAlreadyInStatusException);
  });

  it('sets status to BLOCKED and revokes every session', async () => {
    const { service, userDelegate, tokens } = build();

    await service.block('user-1');

    expect(userDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: UserStatus.BLOCKED } }),
    );
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('AdminUsersService.unblock', () => {
  it('throws UserAlreadyInStatusException when not blocked', async () => {
    const { service } = build();

    await expect(service.unblock('user-1')).rejects.toThrow(UserAlreadyInStatusException);
  });

  it('sets status back to ACTIVE', async () => {
    const { service, userDelegate } = build({
      user: { findUnique: jest.fn().mockResolvedValue({ ...USER, status: UserStatus.BLOCKED }) },
    });

    await service.unblock('user-1');

    expect(userDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: UserStatus.ACTIVE } }),
    );
  });
});
