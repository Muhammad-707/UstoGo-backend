import { Injectable } from '@nestjs/common';
import { ApprovalStatus, FilePurpose, type Certificate, type MasterProfile } from '@prisma/client';

import {
  CategoryNotFoundException,
  CategoryNotLeafException,
} from '@modules/categories/exceptions/categories.exceptions';
import { FilesService } from '@modules/files/services/files.service';
import { PrismaService } from '@prisma-lib/prisma.service';

import type { CreateCertificateDto } from '../dto/requests/create-certificate.dto';
import {
  InvalidApprovalTransitionException,
  MasterNotFoundException,
} from '../exceptions/masters.exceptions';

/** F-03 (MODULES.md › MastersModule). Self-service: category attachment, certificates, submission. */
@Injectable()
export class MastersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async getByUserId(userId: string): Promise<MasterProfile> {
    const master = await this.prisma.db.masterProfile.findUnique({ where: { userId } });

    if (master === null) {
      throw new MasterNotFoundException();
    }

    return master;
  }

  /**
   * Registration already creates the profile `PENDING` (FR-1.2), so this is only a
   * real transition after a rejection — otherwise it is an idempotent confirmation of
   * the state the caller is already in. `POST /masters/me/submit` and
   * `POST /masters/me/resubmit` both call this; the spec names two intents that
   * collapse to one transition once PENDING already happens at registration.
   */
  async submitForReview(userId: string): Promise<MasterProfile> {
    const master = await this.getByUserId(userId);

    if (master.approvalStatus === ApprovalStatus.APPROVED) {
      throw new InvalidApprovalTransitionException();
    }
    if (master.approvalStatus === ApprovalStatus.PENDING) {
      return master;
    }

    return this.prisma.db.masterProfile.update({
      where: { userId },
      data: { approvalStatus: ApprovalStatus.PENDING, rejectionReason: null },
    });
  }

  async listCategoryIds(userId: string): Promise<string[]> {
    const master = await this.getByUserId(userId);
    const rows = await this.prisma.db.masterCategory.findMany({
      where: { masterProfileId: master.id },
      select: { categoryId: true },
    });

    return rows.map((row) => row.categoryId);
  }

  /** Idempotent — attaching an already-attached category is not a conflict. */
  async attachCategory(userId: string, categoryId: string): Promise<void> {
    const master = await this.getByUserId(userId);
    await this.assertLeafCategory(categoryId);

    await this.prisma.db.masterCategory.upsert({
      where: { masterProfileId_categoryId: { masterProfileId: master.id, categoryId } },
      create: { masterProfileId: master.id, categoryId },
      update: {},
    });
  }

  async detachCategory(userId: string, categoryId: string): Promise<void> {
    const master = await this.getByUserId(userId);

    await this.prisma.db.masterCategory.deleteMany({
      where: { masterProfileId: master.id, categoryId },
    });
  }

  async listCertificates(userId: string): Promise<Certificate[]> {
    const master = await this.getByUserId(userId);

    return this.prisma.db.certificate.findMany({
      where: { masterProfileId: master.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCertificate(userId: string, dto: CreateCertificateDto): Promise<Certificate> {
    const master = await this.getByUserId(userId);

    await this.files.getAttachable(dto.fileId, userId, FilePurpose.CERTIFICATE);

    return this.prisma.db.certificate.create({
      data: {
        masterProfileId: master.id,
        fileId: dto.fileId,
        title: dto.title,
        ...(dto.issuedBy !== undefined ? { issuedBy: dto.issuedBy } : {}),
        ...(dto.issuedAt !== undefined ? { issuedAt: new Date(dto.issuedAt) } : {}),
      },
    });
  }

  async removeCertificate(userId: string, certificateId: string): Promise<void> {
    const master = await this.getByUserId(userId);

    await this.prisma.db.certificate.updateMany({
      where: { id: certificateId, masterProfileId: master.id },
      data: { deletedAt: new Date() },
    });
  }

  private async assertLeafCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.db.category.findUnique({ where: { id: categoryId } });

    if (category === null) {
      throw new CategoryNotFoundException();
    }

    const activeChild = await this.prisma.db.category.findFirst({
      where: { parentId: categoryId, isActive: true },
    });

    if (activeChild !== null) {
      throw new CategoryNotLeafException();
    }
  }
}
