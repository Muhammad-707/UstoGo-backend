import { Injectable } from '@nestjs/common';
import type { Certificate } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import type { AdminCertificateQueryDto } from '../dto/requests/admin-certificate-query.dto';
import {
  CertificateAlreadyVerifiedException,
  CertificateNotFoundException,
} from '../exceptions/masters.exceptions';

const CERTIFICATE_WITH_MASTER_INCLUDE = {
  masterProfile: { select: { id: true, displayName: true } },
} as const;

type CertificateWithMaster = Certificate & {
  masterProfile: { id: string; displayName: string };
};

/**
 * §6.17 (MASTER_PROMPT.md): `Certificate.verifiedAt`/`verifiedByUserId` were stored
 * since F-03 but nothing ever wrote to them — a certificate uploaded by a master
 * stayed unverified forever, and `MASTER_PUBLIC_SELECT` already gates `hasCertificates`
 * on `verifiedAt IS NOT NULL`, so the "verified" badge was silently permanent-false.
 */
@Injectable()
export class AdminCertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: AdminCertificateQueryDto,
  ): Promise<{ items: CertificateWithMaster[]; total: number }> {
    const where = {
      deletedAt: null,
      ...(query.verified === undefined
        ? {}
        : { verifiedAt: query.verified ? { not: null } : null }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.certificate.findMany({
        where,
        include: CERTIFICATE_WITH_MASTER_INCLUDE,
        orderBy: { createdAt: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.certificate.count({ where }),
    ]);

    return { items, total };
  }

  async verify(certificateId: string, adminUserId: string): Promise<CertificateWithMaster> {
    const certificate = await this.findActive(certificateId);
    if (certificate.verifiedAt !== null) {
      throw new CertificateAlreadyVerifiedException();
    }

    return this.prisma.db.certificate.update({
      where: { id: certificate.id },
      data: { verifiedAt: new Date(), verifiedByUserId: adminUserId },
      include: CERTIFICATE_WITH_MASTER_INCLUDE,
    });
  }

  /**
   * Rejecting is a soft delete, not a status flag — there is no "rejected but still
   * shown" state anywhere else `Certificate` participates (the public profile only
   * ever reads verified, non-deleted rows), so an admin-rejected certificate leaves
   * the master's profile the same way `MastersService.removeCertificate` already
   * makes a self-removed one disappear.
   */
  async reject(certificateId: string): Promise<CertificateWithMaster> {
    const certificate = await this.findActive(certificateId);

    return this.prisma.db.certificate.update({
      where: { id: certificate.id },
      data: { deletedAt: new Date() },
      include: CERTIFICATE_WITH_MASTER_INCLUDE,
    });
  }

  private async findActive(certificateId: string) {
    const certificate = await this.prisma.db.certificate.findFirst({
      where: { id: certificateId, deletedAt: null },
    });
    if (certificate === null) {
      throw new CertificateNotFoundException();
    }
    return certificate;
  }
}
