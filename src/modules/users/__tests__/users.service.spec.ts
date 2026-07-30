import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import type { TokenService } from '../../auth/services/token.service';
import type { FilesService } from '../../files/services/files.service';
import {
  CityNotFoundException,
  FieldNotApplicableException,
  UserNotFoundException,
} from '../exceptions/users.exceptions';
import { UsersService } from '../services/users.service';

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const CLIENT = {
  id: 'u1',
  role: 'CLIENT',
  clientProfile: { id: 'cp1', firstName: 'Aziz', lastName: 'Karimov' },
  masterProfile: null,
};

const MASTER = {
  id: 'u2',
  role: 'MASTER',
  clientProfile: null,
  masterProfile: { id: 'mp1', displayName: 'Bek Plumbing' },
};

const build = (options: { user?: unknown; city?: unknown } = {}) => {
  const userStub = 'user' in options ? options.user : CLIENT;
  const cityStub = 'city' in options ? options.city : { id: 'c1' };

  const userDelegate = {
    findUnique: jest.fn().mockResolvedValue(userStub),
    update: jest.fn().mockResolvedValue({}),
  };
  const clientProfile = { update: jest.fn().mockResolvedValue({}) };
  const masterProfile = { update: jest.fn().mockResolvedValue({}) };
  const cityDelegate = { findFirst: jest.fn().mockResolvedValue(cityStub) };

  const prisma = {
    db: { user: userDelegate, city: cityDelegate },
  } as unknown as PrismaService;
  const tx = {
    run: (fn: (client: unknown) => unknown) =>
      fn({ user: userDelegate, clientProfile, masterProfile }),
  } as unknown as TransactionManager;
  const tokens = {
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;
  const files = {
    getAttachable: jest.fn().mockResolvedValue({ id: 'f1' }),
    softDelete: jest.fn().mockResolvedValue(undefined),
  } as unknown as FilesService;

  return {
    service: new UsersService(prisma, tx, tokens, files),
    files,
    userDelegate,
    clientProfile,
    masterProfile,
    cityDelegate,
    tokens,
  };
};

describe('UsersService.findMe', () => {
  it('returns the account with its profile', async () => {
    const { service } = build();

    await expect(service.findMe('u1')).resolves.toMatchObject({ id: 'u1' });
  });

  it('raises USER_NOT_FOUND when the account no longer resolves', async () => {
    const { service } = build({ user: null });

    await expect(service.findMe('gone')).rejects.toBeInstanceOf(UserNotFoundException);
  });

  // The soft-delete extension makes a deleted account simply not resolve, so this is
  // also the deleted-account path — there is no deletedAt check to forget.
  it('never asks for the password hash', async () => {
    const { service, userDelegate } = build();

    await service.findMe('u1');
    const query = firstArg<{ select: Record<string, unknown> }>(userDelegate.findUnique);

    expect(query.select).not.toHaveProperty('passwordHash');
  });
});

describe('UsersService.updateMe', () => {
  it('updates a client profile', async () => {
    const { service, clientProfile } = build();

    await service.updateMe('u1', { firstName: 'Azizbek' });
    const update = firstArg<{ data: Record<string, unknown> }>(clientProfile.update);

    expect(update.data).toEqual({ firstName: 'Azizbek' });
  });

  it('updates a master profile', async () => {
    const { service, masterProfile } = build({ user: MASTER });

    await service.updateMe('u2', { displayName: 'Bek Heating' });
    const update = firstArg<{ data: Record<string, unknown> }>(masterProfile.update);

    expect(update.data).toEqual({ displayName: 'Bek Heating' });
  });

  // Spreading the DTO wholesale would write undefined over columns the caller never
  // mentioned — a partial update has to distinguish "not sent" from "sent as null".
  it('writes only the fields that were supplied', async () => {
    const { service, clientProfile } = build();

    await service.updateMe('u1', { firstName: 'Azizbek' });
    const update = firstArg<{ data: Record<string, unknown> }>(clientProfile.update);

    expect(Object.keys(update.data)).toEqual(['firstName']);
    expect(update.data).not.toHaveProperty('lastName');
  });

  it('updates the phone on the user row, not the profile', async () => {
    const { service, userDelegate } = build();

    await service.updateMe('u1', { phone: '+998901234567' });

    expect(userDelegate.update).toHaveBeenCalledTimes(1);
  });

  it('leaves the user row alone when no phone was supplied', async () => {
    const { service, userDelegate } = build();

    await service.updateMe('u1', { firstName: 'Azizbek' });

    expect(userDelegate.update).not.toHaveBeenCalled();
  });

  describe('role-specific fields', () => {
    // Silently dropping a field is how a client ships a feature that appears to work
    // and never persists anything.
    it('rejects a master-only field from a client', async () => {
      const { service } = build();

      await expect(service.updateMe('u1', { displayName: 'nope' })).rejects.toBeInstanceOf(
        FieldNotApplicableException,
      );
    });

    it('rejects a client-only field from a master', async () => {
      const { service } = build({ user: MASTER });

      await expect(service.updateMe('u2', { defaultAddress: 'nope' })).rejects.toBeInstanceOf(
        FieldNotApplicableException,
      );
    });

    it('names every offending field', async () => {
      const { service } = build();

      try {
        await service.updateMe('u1', { displayName: 'a', bio: 'b', timezone: 'UTC' });
        throw new Error('expected updateMe to reject');
      } catch (error) {
        const { details } = error as FieldNotApplicableException;

        expect(details.map((d) => d.field).sort()).toEqual(['bio', 'displayName', 'timezone']);
      }
    });

    it('allows shared fields for either role', async () => {
      const { service, masterProfile } = build({ user: MASTER });

      await expect(service.updateMe('u2', { firstName: 'Bekzod' })).resolves.toBeDefined();
      expect(masterProfile.update).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects an unknown city', async () => {
    const { service } = build({ city: null });

    await expect(service.updateMe('u1', { cityId: 'missing' })).rejects.toBeInstanceOf(
      CityNotFoundException,
    );
  });

  it('does not look up a city when none was supplied', async () => {
    const { service, cityDelegate } = build();

    await service.updateMe('u1', { firstName: 'Azizbek' });

    expect(cityDelegate.findFirst).not.toHaveBeenCalled();
  });
});

describe('UsersService.deleteMe', () => {
  it('soft-deletes the account and revokes every session', async () => {
    const { service, userDelegate, tokens } = build();

    await service.deleteMe('u1');
    const update = firstArg<{ data: { deletedAt: Date; status: string } }>(userDelegate.update);

    expect(update.data.deletedAt).toBeInstanceOf(Date);
    expect(update.data.status).toBe('INACTIVE');
    expect(tokens.revokeAllForUser).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes the client profile alongside the account', async () => {
    const { service, clientProfile, masterProfile } = build();

    await service.deleteMe('u1');

    expect(clientProfile.update).toHaveBeenCalledTimes(1);
    expect(masterProfile.update).not.toHaveBeenCalled();
  });

  // A deleted master must also leave search, which keys on isActive.
  it('deactivates a master profile as well as deleting it', async () => {
    const { service, masterProfile } = build({ user: MASTER });

    await service.deleteMe('u2');
    const update = firstArg<{ data: { isActive: boolean } }>(masterProfile.update);

    expect(update.data.isActive).toBe(false);
  });

  it('refuses to delete an account that no longer resolves', async () => {
    const { service } = build({ user: null });

    await expect(service.deleteMe('gone')).rejects.toBeInstanceOf(UserNotFoundException);
  });

  it('anonymises the email and clears the phone', async () => {
    const { service, userDelegate } = build();

    await service.deleteMe('u1');
    const update = firstArg<{ data: { email: string; phone: null } }>(userDelegate.update);

    expect(update.data.email).toBe('deleted-u1@deleted.invalid');
    expect(update.data.phone).toBeNull();
  });

  it('anonymises the client profile name and address', async () => {
    const { service, clientProfile } = build();

    await service.deleteMe('u1');
    const update = firstArg<{
      data: { firstName: string; lastName: string; defaultAddress: null; avatarFileId: null };
    }>(clientProfile.update);

    expect(update.data).toMatchObject({
      firstName: 'Deleted',
      lastName: 'User',
      defaultAddress: null,
      avatarFileId: null,
    });
  });

  it('anonymises the master profile display name and bio', async () => {
    const { service, masterProfile } = build({ user: MASTER });

    await service.deleteMe('u2');
    const update = firstArg<{
      data: { displayName: string; bio: null; avatarFileId: null };
    }>(masterProfile.update);

    expect(update.data).toMatchObject({
      displayName: 'Deleted User',
      bio: null,
      avatarFileId: null,
    });
  });

  it('releases the avatar file when one was set', async () => {
    const { service, files } = build({
      user: {
        ...CLIENT,
        clientProfile: { ...CLIENT.clientProfile, avatarFileId: 'avatar-1' },
      },
    });

    await service.deleteMe('u1');

    expect(files.softDelete).toHaveBeenCalledWith('avatar-1');
  });

  it('does not touch file storage when no avatar was set', async () => {
    const { service, files } = build();

    await service.deleteMe('u1');

    expect(files.softDelete).not.toHaveBeenCalled();
  });
});
