import { UserRole } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import { DataExportService } from '../services/data-export.service';
import type { UsersService } from '../services/users.service';

const ACCOUNT = {
  id: 'u1',
  email: 'aziz@example.com',
  phone: null,
  role: 'CLIENT',
  status: 'ACTIVE',
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  clientProfile: { id: 'cp1', firstName: 'Aziz', lastName: 'Karimov' },
  masterProfile: null,
};

const build = (options: { profile?: unknown } = {}) => {
  const users = { findMe: jest.fn().mockResolvedValue(ACCOUNT) } as unknown as UsersService;

  const clientProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue('profile' in options ? options.profile : { id: 'cp1' }),
  };
  const bookingDelegate = { findMany: jest.fn().mockResolvedValue([]) };
  const reviewDelegate = { findMany: jest.fn().mockResolvedValue([]) };
  const notificationDelegate = { findMany: jest.fn().mockResolvedValue([]) };

  const prisma = {
    db: {
      clientProfile: clientProfileDelegate,
      masterProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      booking: bookingDelegate,
      review: reviewDelegate,
      notification: notificationDelegate,
    },
  } as unknown as PrismaService;

  return {
    service: new DataExportService(prisma, users),
    users,
    bookingDelegate,
    reviewDelegate,
    notificationDelegate,
  };
};

describe('DataExportService.export', () => {
  it('includes the account projection', async () => {
    const { service } = build();

    const result = await service.export('u1', UserRole.CLIENT);

    expect(result.account.id).toBe('u1');
    expect(result.exportedAt).toBeInstanceOf(Date);
  });

  it('scopes bookings and reviews to the caller’s own profile', async () => {
    const { service, bookingDelegate, reviewDelegate } = build();

    await service.export('u1', UserRole.CLIENT);

    expect(bookingDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientProfileId: 'cp1' } }),
    );
    expect(reviewDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientProfileId: 'cp1' } }),
    );
  });

  it('returns empty booking and review lists when the profile cannot be resolved', async () => {
    const { service, bookingDelegate } = build({ profile: null });

    const result = await service.export('u1', UserRole.CLIENT);

    expect(result.bookings).toEqual([]);
    expect(bookingDelegate.findMany).not.toHaveBeenCalled();
  });
});
