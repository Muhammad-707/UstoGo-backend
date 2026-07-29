import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

/** Shared by every transition service that resolves the caller's own profile id. */
export const masterProfileIdFor = async (
  prisma: PrismaService,
  userId: string,
): Promise<string> => {
  const master = await prisma.db.masterProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (master === null) {
    throw new ResourceNotFoundException(ERROR_CODE.MASTER_NOT_FOUND, 'Master profile not found.');
  }
  return master.id;
};

export const clientProfileIdFor = async (
  prisma: PrismaService,
  userId: string,
): Promise<string> => {
  const client = await prisma.db.clientProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (client === null) {
    throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
  }
  return client.id;
};
