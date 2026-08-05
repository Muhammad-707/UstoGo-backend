import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  CertificateAlreadyVerifiedException,
  CertificateNotFoundException,
} from '../../exceptions/masters.exceptions';
import { AdminCertificatesService } from '../admin-certificates.service';

const CERTIFICATE = {
  id: 'cert-1',
  masterProfileId: 'master-1',
  verifiedAt: null as Date | null,
  deletedAt: null as Date | null,
  masterProfile: { id: 'master-1', displayName: 'Jamshed' },
};

const build = (overrides: { certificate?: Partial<Record<string, jest.Mock>> } = {}) => {
  const certificateDelegate = {
    findMany: jest.fn().mockResolvedValue([CERTIFICATE]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(CERTIFICATE),
    update: jest.fn().mockResolvedValue(CERTIFICATE),
    ...overrides.certificate,
  };
  const prisma = {
    db: { certificate: certificateDelegate },
  } as unknown as PrismaService;

  return { prisma, certificateDelegate, service: new AdminCertificatesService(prisma) };
};

describe('AdminCertificatesService.list', () => {
  it('filters to unverified certificates by default', async () => {
    const { service, certificateDelegate } = build();

    await service.list({ page: 1, limit: 20, skip: 0 });

    const { where } = certificateDelegate.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where).not.toHaveProperty('verifiedAt');
  });

  it('filters to verified=false explicitly', async () => {
    const { service, certificateDelegate } = build();

    await service.list({ page: 1, limit: 20, skip: 0, verified: false });

    const { where } = certificateDelegate.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where['verifiedAt']).toBeNull();
  });

  it('filters to verified=true', async () => {
    const { service, certificateDelegate } = build();

    await service.list({ page: 1, limit: 20, skip: 0, verified: true });

    const { where } = certificateDelegate.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where['verifiedAt']).toEqual({ not: null });
  });

  it('always excludes soft-deleted certificates', async () => {
    const { service, certificateDelegate } = build();

    await service.list({ page: 1, limit: 20, skip: 0 });

    const { where } = certificateDelegate.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where['deletedAt']).toBeNull();
  });
});

describe('AdminCertificatesService.verify', () => {
  it('throws CertificateNotFoundException for an unknown or deleted certificate', async () => {
    const { service } = build({ certificate: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.verify('nope', 'admin-1')).rejects.toThrow(CertificateNotFoundException);
  });

  it('throws CertificateAlreadyVerifiedException when already verified', async () => {
    const { service } = build({
      certificate: {
        findFirst: jest.fn().mockResolvedValue({ ...CERTIFICATE, verifiedAt: new Date() }),
      },
    });

    await expect(service.verify('cert-1', 'admin-1')).rejects.toThrow(
      CertificateAlreadyVerifiedException,
    );
  });

  it('stamps verifiedAt and verifiedByUserId', async () => {
    const { service, certificateDelegate } = build();

    await service.verify('cert-1', 'admin-1');

    expect(certificateDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verifiedByUserId: 'admin-1' }),
      }),
    );
  });
});

describe('AdminCertificatesService.reject', () => {
  it('throws CertificateNotFoundException for an unknown certificate', async () => {
    const { service } = build({ certificate: { findFirst: jest.fn().mockResolvedValue(null) } });

    await expect(service.reject('nope')).rejects.toThrow(CertificateNotFoundException);
  });

  it('soft-deletes the certificate', async () => {
    const { service, certificateDelegate } = build();

    await service.reject('cert-1');

    expect(certificateDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
  });
});
