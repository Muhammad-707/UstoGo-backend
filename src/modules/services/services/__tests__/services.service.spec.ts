import { PriceType } from '@prisma/client';

import type { AppConfigService } from '@config/app-config.service';
import {
  CategoryNotFoundException,
  CategoryNotLeafException,
} from '@modules/categories/exceptions/categories.exceptions';
import { MasterNotFoundException } from '@modules/masters/exceptions/masters.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  ServiceCategoryNotAttachedException,
  ServiceNotFoundException,
} from '../../exceptions/services.exceptions';
import { ServicesService } from '../services.service';

const MASTER_PROFILE_ID = 'mp-1';
const PROPERTIES = { id: 'svc-1', masterProfileId: MASTER_PROFILE_ID };

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
    category?: Partial<Record<string, jest.Mock>>;
    masterCategory?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const masterProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue({ id: MASTER_PROFILE_ID }),
    ...overrides.masterProfile,
  };
  const serviceDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(PROPERTIES),
    create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
    })),
    update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      ...data,
    })),
    ...overrides.service,
  };
  const categoryDelegate = {
    findUnique: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    findFirst: jest.fn().mockResolvedValue(null),
    ...overrides.category,
  };
  const masterCategoryDelegate = {
    findUnique: jest.fn().mockResolvedValue({}),
    ...overrides.masterCategory,
  };
  const prisma = {
    db: {
      masterProfile: masterProfileDelegate,
      service: serviceDelegate,
      category: categoryDelegate,
      masterCategory: masterCategoryDelegate,
    },
  } as unknown as PrismaService;
  const config = { catalogue: { currency: 'TJS' } } as unknown as AppConfigService;

  return {
    service: new ServicesService(prisma, config),
    masterProfileDelegate,
    serviceDelegate,
    categoryDelegate,
    masterCategoryDelegate,
  };
};

const CREATE_DTO = {
  categoryId: 'cat-1',
  title: 'Leak repair',
  priceType: PriceType.FIXED,
  price: 50,
  durationMinutes: 60,
};

describe('ServicesService.list', () => {
  it('throws when the caller has no master profile', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.list('ghost')).rejects.toBeInstanceOf(MasterNotFoundException);
  });

  it('returns the caller’s services newest first', async () => {
    const { service, serviceDelegate, masterProfileDelegate } = build();

    const result = await service.list('user-1');

    expect(masterProfileDelegate.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true },
    });
    expect(serviceDelegate.findMany).toHaveBeenCalledWith({
      where: { masterProfileId: MASTER_PROFILE_ID },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([]);
  });
});

describe('ServicesService.create', () => {
  it('creates a service against the catalogue currency', async () => {
    const { service, serviceDelegate, categoryDelegate, masterCategoryDelegate } = build();

    await service.create('user-1', CREATE_DTO);

    expect(categoryDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
    });
    expect(masterCategoryDelegate.findUnique).toHaveBeenCalledWith({
      where: {
        masterProfileId_categoryId: { masterProfileId: MASTER_PROFILE_ID, categoryId: 'cat-1' },
      },
    });
    expect(serviceDelegate.create).toHaveBeenCalledWith({
      data: {
        masterProfileId: MASTER_PROFILE_ID,
        categoryId: 'cat-1',
        title: 'Leak repair',
        priceType: PriceType.FIXED,
        price: 50,
        durationMinutes: 60,
        currency: 'TJS',
      },
    });
  });

  it('persists an optional description when provided', async () => {
    const { service, serviceDelegate } = build();

    await service.create('user-1', { ...CREATE_DTO, description: 'A note' });

    expect(serviceDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: 'A note' }) }),
    );
  });

  it('rejects a category that does not exist', async () => {
    const { service } = build({ category: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.create('user-1', CREATE_DTO)).rejects.toBeInstanceOf(
      CategoryNotFoundException,
    );
  });

  it('rejects a non-leaf category', async () => {
    const { service } = build({
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'child' }) },
    });

    await expect(service.create('user-1', CREATE_DTO)).rejects.toBeInstanceOf(
      CategoryNotLeafException,
    );
  });

  it('rejects a category the master has not attached', async () => {
    const { service } = build({
      masterCategory: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.create('user-1', CREATE_DTO)).rejects.toBeInstanceOf(
      ServiceCategoryNotAttachedException,
    );
  });
});

describe('ServicesService.update', () => {
  it('rejects a service the caller does not own', async () => {
    const { service } = build({ service: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.update('user-1', 'svc-1', { title: 'New' })).rejects.toBeInstanceOf(
      ServiceNotFoundException,
    );
  });

  it('sends only the provided fields to the database', async () => {
    const { service, serviceDelegate } = build();

    await service.update('user-1', 'svc-1', { title: 'Renamed' });

    expect(serviceDelegate.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { title: 'Renamed' },
    });
  });

  it('maps every provided field onto the update payload', async () => {
    const { service, serviceDelegate } = build();

    await service.update('user-1', 'svc-1', {
      title: 'Renamed',
      description: 'Full rewrite',
      priceType: PriceType.HOURLY,
      price: 120.5,
      durationMinutes: 90,
      isActive: false,
    });

    expect(serviceDelegate.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: {
        title: 'Renamed',
        description: 'Full rewrite',
        priceType: PriceType.HOURLY,
        price: 120.5,
        durationMinutes: 90,
        isActive: false,
      },
    });
  });

  it('omits fields the caller did not provide', async () => {
    const { service, serviceDelegate } = build();

    await service.update('user-1', 'svc-1', { description: 'Only the note' });

    expect(serviceDelegate.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { description: 'Only the note' },
    });
  });
});

describe('ServicesService.remove', () => {
  it('soft-deletes a service the caller owns', async () => {
    const { service, serviceDelegate } = build();

    await service.remove('user-1', 'svc-1');

    expect(serviceDelegate.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('throws for a service the caller does not own', async () => {
    const { service } = build({ service: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.remove('user-1', 'svc-1')).rejects.toBeInstanceOf(
      ServiceNotFoundException,
    );
  });
});
