import { ApprovalStatus } from '@prisma/client';

import {
  CategoryNotFoundException,
  CategoryNotLeafException,
} from '@modules/categories/exceptions/categories.exceptions';
import type { FilesService } from '@modules/files/services/files.service';
import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  InvalidApprovalTransitionException,
  MasterNotFoundException,
} from '../../exceptions/masters.exceptions';
import { MastersService } from '../masters.service';

const MASTER = { id: 'mp-1', userId: 'user-1', approvalStatus: ApprovalStatus.PENDING };

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    category?: Partial<Record<string, jest.Mock>>;
    masterCategory?: Partial<Record<string, jest.Mock>>;
    certificate?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const masterProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue(MASTER),
    update: jest.fn().mockResolvedValue(MASTER),
    ...overrides.masterProfile,
  };
  const categoryDelegate = {
    findUnique: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    findFirst: jest.fn().mockResolvedValue(null),
    ...overrides.category,
  };
  const masterCategoryDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides.masterCategory,
  };
  const certificateDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'cert-1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides.certificate,
  };
  const prisma = {
    db: {
      masterProfile: masterProfileDelegate,
      category: categoryDelegate,
      masterCategory: masterCategoryDelegate,
      certificate: certificateDelegate,
    },
  } as unknown as PrismaService;
  const files = {
    getAttachable: jest.fn().mockResolvedValue({ id: 'file-1' }),
  } as unknown as FilesService;

  return {
    service: new MastersService(prisma, files),
    masterProfileDelegate,
    categoryDelegate,
    masterCategoryDelegate,
    certificateDelegate,
    files,
  };
};

describe('MastersService.getByUserId', () => {
  it('throws when no profile exists', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.getByUserId('ghost')).rejects.toBeInstanceOf(MasterNotFoundException);
  });
});

describe('MastersService.submitForReview', () => {
  it('rejects when already approved', async () => {
    const { service } = build({
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...MASTER, approvalStatus: ApprovalStatus.APPROVED }),
      },
    });

    await expect(service.submitForReview('user-1')).rejects.toBeInstanceOf(
      InvalidApprovalTransitionException,
    );
  });

  it('is a no-op when already pending', async () => {
    const { service, masterProfileDelegate } = build();

    await service.submitForReview('user-1');

    expect(masterProfileDelegate.update).not.toHaveBeenCalled();
  });

  it('transitions a rejected master back to pending', async () => {
    const { service, masterProfileDelegate } = build({
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...MASTER, approvalStatus: ApprovalStatus.REJECTED }),
        update: jest.fn().mockResolvedValue(MASTER),
      },
    });

    await service.submitForReview('user-1');

    expect(masterProfileDelegate.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { approvalStatus: ApprovalStatus.PENDING, rejectionReason: null },
    });
  });
});

describe('MastersService category attachment', () => {
  it('rejects attaching a category that does not exist', async () => {
    const { service } = build({ category: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.attachCategory('user-1', 'ghost')).rejects.toBeInstanceOf(
      CategoryNotFoundException,
    );
  });

  it('rejects attaching a non-leaf category', async () => {
    const { service } = build({
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'child' }) },
    });

    await expect(service.attachCategory('user-1', 'cat-1')).rejects.toBeInstanceOf(
      CategoryNotLeafException,
    );
  });

  it('upserts on attach and lists attached ids', async () => {
    const { service, masterCategoryDelegate } = build();

    await service.attachCategory('user-1', 'cat-1');

    expect(masterCategoryDelegate.upsert).toHaveBeenCalled();
  });

  it('detaches a category', async () => {
    const { service, masterCategoryDelegate } = build();

    await service.detachCategory('user-1', 'cat-1');

    expect(masterCategoryDelegate.deleteMany).toHaveBeenCalledWith({
      where: { masterProfileId: 'mp-1', categoryId: 'cat-1' },
    });
  });
});

describe('MastersService certificates', () => {
  it('verifies the file belongs to the caller and is a confirmed certificate', async () => {
    const { service, files } = build();

    await service.createCertificate('user-1', { fileId: 'file-1', title: 'License' });

    expect(files.getAttachable).toHaveBeenCalledWith('file-1', 'user-1', 'CERTIFICATE');
  });

  it('soft-deletes a certificate scoped to the caller', async () => {
    const { service, certificateDelegate } = build();

    await service.removeCertificate('user-1', 'cert-1');

    expect(certificateDelegate.updateMany).toHaveBeenCalledWith({
      where: { id: 'cert-1', masterProfileId: 'mp-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('lists certificates for the caller', async () => {
    const { service, certificateDelegate } = build();

    await service.listCertificates('user-1');

    expect(certificateDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { masterProfileId: 'mp-1' } }),
    );
  });
});
