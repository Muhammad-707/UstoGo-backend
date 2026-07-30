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

const build = (
  options: { profile?: unknown; masterProfile?: unknown; bookings?: unknown[] } = {},
) => {
  const users = { findMe: jest.fn().mockResolvedValue(ACCOUNT) } as unknown as UsersService;

  const clientProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue('profile' in options ? options.profile : { id: 'cp1' }),
  };
  const masterProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue(options.masterProfile ?? null),
  };
  const bookingDelegate = { findMany: jest.fn().mockResolvedValue(options.bookings ?? []) };
  const reviewDelegate = { findMany: jest.fn().mockResolvedValue([]) };
  const notificationDelegate = { findMany: jest.fn().mockResolvedValue([]) };

  const prisma = {
    db: {
      clientProfile: clientProfileDelegate,
      masterProfile: masterProfileDelegate,
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
    masterProfileDelegate,
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

  it('scopes bookings and reviews to the master’s own profile', async () => {
    const { service, bookingDelegate, reviewDelegate, masterProfileDelegate } = build({
      masterProfile: { id: 'mp1' },
    });

    await service.export('u2', UserRole.MASTER);

    expect(masterProfileDelegate.findUnique).toHaveBeenCalled();
    expect(bookingDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { masterProfileId: 'mp1' } }),
    );
    expect(reviewDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { masterProfileId: 'mp1' } }),
    );
  });

  it('formats each booking price as a fixed-scale string', async () => {
    const price = { toFixed: jest.fn().mockReturnValue('49.99') };
    const { service } = build({ bookings: [{ id: 'b1', price }] });

    const result = await service.export('u1', UserRole.CLIENT);

    expect(result.bookings[0]).toMatchObject({ id: 'b1', price: '49.99' });
    expect(price.toFixed).toHaveBeenCalledWith(2);
  });

  it('resolves no profile for a role with no profile at all (ADMIN)', async () => {
    const { service, bookingDelegate } = build();

    const result = await service.export('a1', UserRole.ADMIN);

    expect(result.bookings).toEqual([]);
    expect(bookingDelegate.findMany).not.toHaveBeenCalled();
  });
});
