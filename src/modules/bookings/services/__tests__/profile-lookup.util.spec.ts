import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import { clientProfileIdFor, masterProfileIdFor } from '../profile-lookup.util';

const build = (overrides: { master?: jest.Mock; client?: jest.Mock } = {}) => {
  const prisma = {
    db: {
      masterProfile: {
        findUnique: overrides.master ?? jest.fn().mockResolvedValue({ id: 'mp-1' }),
      },
      clientProfile: {
        findUnique: overrides.client ?? jest.fn().mockResolvedValue({ id: 'cp-1' }),
      },
    },
  } as unknown as PrismaService;

  return prisma;
};

describe('masterProfileIdFor', () => {
  it('resolves the master profile id for the user', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'mp-1' });
    const prisma = build({ master: findUnique });

    await expect(masterProfileIdFor(prisma, 'user-1')).resolves.toBe('mp-1');

    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true },
    });
  });

  it('throws MASTER_NOT_FOUND when the user has no master profile', async () => {
    const prisma = build({ master: jest.fn().mockResolvedValue(null) });

    await expect(masterProfileIdFor(prisma, 'ghost')).rejects.toThrow(
      new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master profile not found.'),
    );
  });
});

describe('clientProfileIdFor', () => {
  it('resolves the client profile id for the user', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'cp-1' });
    const prisma = build({ client: findUnique });

    await expect(clientProfileIdFor(prisma, 'user-1')).resolves.toBe('cp-1');

    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true },
    });
  });

  it('throws USER_NOT_FOUND when the user has no client profile', async () => {
    const prisma = build({ client: jest.fn().mockResolvedValue(null) });

    await expect(clientProfileIdFor(prisma, 'ghost')).rejects.toThrow(
      new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.'),
    );
  });
});
