import { ApprovalStatus } from '@prisma/client';

import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  InvalidApprovalTransitionException,
  MasterNotFoundException,
  MasterNotReadyForApprovalException,
} from '../../exceptions/masters.exceptions';
import { MasterModerationService } from '../master-moderation.service';

const MASTER = { id: 'mp-1', approvalStatus: ApprovalStatus.PENDING };

const build = (
  overrides: {
    masterProfile?: Partial<Record<string, jest.Mock>>;
    masterCategory?: Partial<Record<string, jest.Mock>>;
    service?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const masterProfileDelegate = {
    findUnique: jest.fn().mockResolvedValue(MASTER),
    update: jest.fn().mockResolvedValue(MASTER),
    ...overrides.masterProfile,
  };
  const masterCategoryDelegate = {
    count: jest.fn().mockResolvedValue(1),
    ...overrides.masterCategory,
  };
  const serviceDelegate = { count: jest.fn().mockResolvedValue(1), ...overrides.service };
  const prisma = {
    db: {
      masterProfile: masterProfileDelegate,
      masterCategory: masterCategoryDelegate,
      service: serviceDelegate,
    },
  } as unknown as PrismaService;
  const events = { emit: jest.fn() };

  return {
    service: new MasterModerationService(prisma, events as never),
    masterProfileDelegate,
    masterCategoryDelegate,
    serviceDelegate,
    events,
  };
};

describe('MasterModerationService.approve', () => {
  it('throws when the master does not exist', async () => {
    const { service } = build({ masterProfile: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.approve('ghost', 'admin-1')).rejects.toBeInstanceOf(
      MasterNotFoundException,
    );
  });

  it('rejects a non-pending master', async () => {
    const { service } = build({
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...MASTER, approvalStatus: ApprovalStatus.APPROVED }),
      },
    });

    await expect(service.approve('mp-1', 'admin-1')).rejects.toBeInstanceOf(
      InvalidApprovalTransitionException,
    );
  });

  it('requires at least one category', async () => {
    const { service } = build({ masterCategory: { count: jest.fn().mockResolvedValue(0) } });

    await expect(service.approve('mp-1', 'admin-1')).rejects.toBeInstanceOf(
      MasterNotReadyForApprovalException,
    );
  });

  it('requires at least one active service', async () => {
    const { service } = build({ service: { count: jest.fn().mockResolvedValue(0) } });

    await expect(service.approve('mp-1', 'admin-1')).rejects.toBeInstanceOf(
      MasterNotReadyForApprovalException,
    );
  });

  it('approves, sets isActive and emits master.approved', async () => {
    const { service, masterProfileDelegate, events } = build();

    await service.approve('mp-1', 'admin-1');

    expect(masterProfileDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvalStatus: ApprovalStatus.APPROVED, isActive: true }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith('master.approved', expect.anything());
  });
});

describe('MasterModerationService.reject', () => {
  it('rejects a non-pending master', async () => {
    const { service } = build({
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...MASTER, approvalStatus: ApprovalStatus.REJECTED }),
      },
    });

    await expect(service.reject('mp-1', 'bad certs')).rejects.toBeInstanceOf(
      InvalidApprovalTransitionException,
    );
  });

  it('sets REJECTED with the reason', async () => {
    const { service, masterProfileDelegate } = build();

    await service.reject('mp-1', 'bad certs');

    expect(masterProfileDelegate.update).toHaveBeenCalledWith({
      where: { id: 'mp-1' },
      data: { approvalStatus: ApprovalStatus.REJECTED, rejectionReason: 'bad certs' },
    });
  });
});

describe('MasterModerationService.activate/deactivate', () => {
  it('activate requires an approved master', async () => {
    const { service } = build();

    await expect(service.activate('mp-1')).rejects.toBeInstanceOf(
      InvalidApprovalTransitionException,
    );
  });

  it('activates an approved master', async () => {
    const { service, masterProfileDelegate } = build({
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...MASTER, approvalStatus: ApprovalStatus.APPROVED }),
      },
    });

    await service.activate('mp-1');

    expect(masterProfileDelegate.update).toHaveBeenCalledWith({
      where: { id: 'mp-1' },
      data: { isActive: true },
    });
  });

  it('deactivates an approved master and reports zero affected bookings', async () => {
    const { service } = build({
      masterProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...MASTER, approvalStatus: ApprovalStatus.APPROVED }),
      },
    });

    await expect(service.deactivate('mp-1', 'complaint')).resolves.toMatchObject({
      affectedBookings: 0,
    });
  });
});
