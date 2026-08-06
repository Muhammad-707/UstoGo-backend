import type { PrismaService } from '@prisma-lib/prisma.service';
import type { TransactionManager } from '@prisma-lib/transaction.manager';

import {
  CityNotFoundException,
  SavedAddressLimitExceededException,
  SavedAddressNotFoundException,
  UserNotFoundException,
} from '../../exceptions/users.exceptions';
import { SavedAddressesService } from '../saved-addresses.service';

const ADDRESS = { id: 'addr-1', clientProfileId: 'cp-1', label: 'Home', isDefault: false };

const build = (
  overrides: {
    clientProfile?: Partial<Record<string, jest.Mock>>;
    savedAddress?: Partial<Record<string, jest.Mock>>;
    city?: Partial<Record<string, jest.Mock>>;
    txSavedAddress?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const txSavedAddress = {
    create: jest.fn().mockResolvedValue(ADDRESS),
    update: jest.fn().mockResolvedValue(ADDRESS),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...overrides.txSavedAddress,
  };

  const prisma = {
    db: {
      clientProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }),
        ...overrides.clientProfile,
      },
      savedAddress: {
        findMany: jest.fn().mockResolvedValue([ADDRESS]),
        findFirst: jest.fn().mockResolvedValue(ADDRESS),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ ...ADDRESS, deletedAt: new Date() }),
        ...overrides.savedAddress,
      },
      city: {
        findFirst: jest.fn().mockResolvedValue({ id: 'city-1', isActive: true }),
        ...overrides.city,
      },
    },
  } as unknown as PrismaService;

  const transactionManager = {
    run: jest.fn((fn: (tx: unknown) => unknown) => fn({ savedAddress: txSavedAddress })),
  } as unknown as TransactionManager;

  return {
    service: new SavedAddressesService(prisma, transactionManager),
    prisma,
    txSavedAddress,
  };
};

const createDto = (overrides: Partial<Record<string, unknown>> = {}) => ({
  label: 'Home',
  cityId: 'city-1',
  line: '123 Main St',
  district: 'Downtown',
  ...overrides,
});

describe('SavedAddressesService', () => {
  describe('list', () => {
    it('throws UserNotFoundException when the caller has no client profile', async () => {
      const { service } = build({
        clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.list('user-1')).rejects.toThrow(UserNotFoundException);
    });

    it('returns the caller’s live addresses', async () => {
      const { service } = build();

      const result = await service.list('user-1');

      expect(result).toEqual([ADDRESS]);
    });
  });

  describe('create', () => {
    it('throws CityNotFoundException for an unknown/inactive city', async () => {
      const { service } = build({ city: { findFirst: jest.fn().mockResolvedValue(null) } });

      await expect(service.create('user-1', createDto())).rejects.toThrow(CityNotFoundException);
    });

    it('throws SavedAddressLimitExceededException at the cap', async () => {
      const { service } = build({ savedAddress: { count: jest.fn().mockResolvedValue(10) } });

      await expect(service.create('user-1', createDto())).rejects.toThrow(
        SavedAddressLimitExceededException,
      );
    });

    it('clears any existing default before creating one marked isDefault', async () => {
      const { service, txSavedAddress } = build();

      await service.create('user-1', createDto({ isDefault: true }));

      expect(txSavedAddress.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ clientProfileId: 'cp-1' }) }),
      );
      expect(txSavedAddress.create).toHaveBeenCalledTimes(1);
    });

    it('does not touch other defaults when isDefault is not set', async () => {
      const { service, txSavedAddress } = build();

      await service.create('user-1', createDto());

      expect(txSavedAddress.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws SavedAddressNotFoundException for a foreign or unknown id', async () => {
      const { service } = build({ savedAddress: { findFirst: jest.fn().mockResolvedValue(null) } });

      await expect(service.update('user-1', 'ghost', {})).rejects.toThrow(
        SavedAddressNotFoundException,
      );
    });

    it('throws CityNotFoundException when moving to an invalid city', async () => {
      const { service } = build({ city: { findFirst: jest.fn().mockResolvedValue(null) } });

      await expect(service.update('user-1', 'addr-1', { cityId: 'bad-city' })).rejects.toThrow(
        CityNotFoundException,
      );
    });

    it('clears any existing default when promoting this address to default', async () => {
      const { service, txSavedAddress } = build();

      await service.update('user-1', 'addr-1', { isDefault: true });

      expect(txSavedAddress.updateMany).toHaveBeenCalledTimes(1);
      expect(txSavedAddress.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
      );
    });
  });

  describe('remove', () => {
    it('throws SavedAddressNotFoundException for a foreign or unknown id', async () => {
      const { service } = build({ savedAddress: { findFirst: jest.fn().mockResolvedValue(null) } });

      await expect(service.remove('user-1', 'ghost')).rejects.toThrow(
        SavedAddressNotFoundException,
      );
    });

    it('soft-deletes and unsets isDefault', async () => {
      const { service, prisma } = build();

      await service.remove('user-1', 'addr-1');

      expect(prisma.db.savedAddress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'addr-1' },
          data: expect.objectContaining({ isDefault: false }),
        }),
      );
    });
  });
});
