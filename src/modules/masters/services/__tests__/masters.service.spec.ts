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
  PortfolioImageNotFoundException,
  PortfolioLimitExceededException,
} from '../../exceptions/masters.exceptions';
import { MastersService } from '../masters.service';

const MASTER = { id: 'mp-1', userId: 'user-1', approvalStatus: ApprovalStatus.PENDING };

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    category?: Partial<Record<string, jest.Mock>>;
    masterCategory?: Partial<Record<string, jest.Mock>>;
    certificate?: Partial<Record<string, jest.Mock>>;
    portfolioImage?: Partial<Record<string, jest.Mock>>;
    review?: Partial<Record<string, jest.Mock>>;
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
  const portfolioImageDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({ id: 'img-1' }),
    update: jest.fn().mockResolvedValue({ id: 'img-1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides.portfolioImage,
  };
  const reviewDelegate = {
    findMany: jest.fn().mockResolvedValue([]),
    ...overrides.review,
  };
  const prisma = {
    db: {
      masterProfile: masterProfileDelegate,
      category: categoryDelegate,
      masterCategory: masterCategoryDelegate,
      certificate: certificateDelegate,
      portfolioImage: portfolioImageDelegate,
      review: reviewDelegate,
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
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
    portfolioImageDelegate,
    files,
  };
};

describe('MastersService.getByUserId', () => {
  it('throws when no profile exists', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.getByUserId('ghost')).rejects.toBeInstanceOf(MasterNotFoundException);
  });
});

describe('MastersService.getOwnNps', () => {
  it('throws when no profile exists', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.getOwnNps('ghost')).rejects.toBeInstanceOf(MasterNotFoundException);
  });

  it('computes NPS from the caller’s own visible reviews', async () => {
    const { service } = build({
      review: {
        findMany: jest.fn().mockResolvedValue([{ npsScore: 9 }, { npsScore: 10 }, { npsScore: 2 }]),
      },
    });

    const result = await service.getOwnNps('user-1');

    expect(result).toEqual({ promoters: 2, passives: 0, detractors: 1, responseCount: 3, nps: 33 });
  });

  it('reports null nps with zero responses', async () => {
    const { service } = build();

    const result = await service.getOwnNps('user-1');

    expect(result.nps).toBeNull();
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

describe('MastersService portfolio images (B-45)', () => {
  it('verifies the file belongs to the caller and is a confirmed portfolio image', async () => {
    const { service, files } = build();

    await service.addPortfolioImage('user-1', { fileId: 'file-1' });

    expect(files.getAttachable).toHaveBeenCalledWith('file-1', 'user-1', 'PORTFOLIO_IMAGE');
  });

  it('assigns sortOrder from the current live count, excluding soft-deleted images', async () => {
    const { service, portfolioImageDelegate } = build({
      portfolioImage: { count: jest.fn().mockResolvedValue(3) },
    });

    await service.addPortfolioImage('user-1', { fileId: 'file-1' });

    expect(portfolioImageDelegate.count).toHaveBeenCalledWith({
      where: { masterProfileId: 'mp-1', deletedAt: null },
    });
    expect(portfolioImageDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 3 }) }),
    );
  });

  it('rejects adding a portfolio image past the limit', async () => {
    const { service } = build({ portfolioImage: { count: jest.fn().mockResolvedValue(20) } });

    await expect(service.addPortfolioImage('user-1', { fileId: 'file-1' })).rejects.toBeInstanceOf(
      PortfolioLimitExceededException,
    );
  });

  it('soft-deletes a portfolio image scoped to the caller', async () => {
    const { service, portfolioImageDelegate } = build();

    await service.removePortfolioImage('user-1', 'img-1');

    expect(portfolioImageDelegate.updateMany).toHaveBeenCalledWith({
      where: { id: 'img-1', masterProfileId: 'mp-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('lists live portfolio images ordered for the caller', async () => {
    const { service, portfolioImageDelegate } = build();

    await service.listPortfolioImages('user-1');

    expect(portfolioImageDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { masterProfileId: 'mp-1', deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      }),
    );
  });

  it('rejects reordering with an id that is not the caller’s', async () => {
    const { service } = build({
      portfolioImage: { findMany: jest.fn().mockResolvedValue([{ id: 'img-1' }]) },
    });

    await expect(service.reorderPortfolio('user-1', ['img-1', 'ghost'])).rejects.toBeInstanceOf(
      PortfolioImageNotFoundException,
    );
  });

  it('rejects reordering a strict subset of the caller’s images', async () => {
    const { service } = build({
      portfolioImage: {
        findMany: jest.fn().mockResolvedValue([{ id: 'img-1' }, { id: 'img-2' }]),
      },
    });

    await expect(service.reorderPortfolio('user-1', ['img-1'])).rejects.toBeInstanceOf(
      PortfolioImageNotFoundException,
    );
  });

  it('writes sortOrder from array position for every image', async () => {
    const { service, portfolioImageDelegate } = build({
      portfolioImage: {
        findMany: jest.fn().mockResolvedValue([{ id: 'img-1' }, { id: 'img-2' }]),
      },
    });

    await service.reorderPortfolio('user-1', ['img-2', 'img-1']);

    expect(portfolioImageDelegate.update).toHaveBeenCalledWith({
      where: { id: 'img-2' },
      data: { sortOrder: 0 },
    });
    expect(portfolioImageDelegate.update).toHaveBeenCalledWith({
      where: { id: 'img-1' },
      data: { sortOrder: 1 },
    });
  });
});

describe('MastersService.setAvailability', () => {
  it('rejects when the profile is not APPROVED', async () => {
    const { service } = build();

    await expect(service.setAvailability('user-1', false)).rejects.toBeInstanceOf(
      InvalidApprovalTransitionException,
    );
  });

  it('updates isActive when the profile is APPROVED', async () => {
    const { service, masterProfileDelegate } = build({
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...MASTER, approvalStatus: ApprovalStatus.APPROVED }),
      },
    });

    await service.setAvailability('user-1', false);

    expect(masterProfileDelegate.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { isActive: false },
    });
  });
});
