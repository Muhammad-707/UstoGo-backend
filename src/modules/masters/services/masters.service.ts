import { Injectable } from '@nestjs/common';
import {
  ApprovalStatus,
  FilePurpose,
  ReviewStatus,
  type Certificate,
  type MasterProfile,
  type PortfolioImage,
} from '@prisma/client';

import {
  CategoryNotFoundException,
  CategoryNotLeafException,
} from '@modules/categories/exceptions/categories.exceptions';
import { FilesService } from '@modules/files/services/files.service';
import { PrismaService } from '@prisma-lib/prisma.service';

import { computeNps } from '../../reviews/domain/nps.util';
import { PORTFOLIO_IMAGE_LIMIT } from '../constants/masters.constants';
import type { CreateCertificateDto } from '../dto/requests/create-certificate.dto';
import type { CreatePortfolioImageDto } from '../dto/requests/create-portfolio-image.dto';
import type { MasterNpsResponseDto } from '../dto/responses/master-nps.response.dto';
import {
  InvalidApprovalTransitionException,
  MasterNotFoundException,
  PortfolioImageNotFoundException,
  PortfolioLimitExceededException,
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

  /** `GET /masters/me/nps` (MASTER_PROMPT.md §6.1) — the caller's own NPS breakdown. */
  async getOwnNps(userId: string): Promise<MasterNpsResponseDto> {
    const master = await this.getByUserId(userId);

    const rows = await this.prisma.db.review.findMany({
      where: { masterProfileId: master.id, status: ReviewStatus.VISIBLE, npsScore: { not: null } },
      select: { npsScore: true },
    });

    return computeNps(rows.map((row) => row.npsScore as number));
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

  /**
   * Self-service "vacation mode" toggle for an approved master — separate from the
   * admin approve/reject/activate/deactivate moderation gate, which stays untouched.
   * Only an already-`APPROVED` master may flip this; it has no effect on approval state.
   */
  async setAvailability(userId: string, isActive: boolean): Promise<MasterProfile> {
    const master = await this.getByUserId(userId);

    if (master.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new InvalidApprovalTransitionException();
    }

    return this.prisma.db.masterProfile.update({
      where: { userId },
      data: { isActive },
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

  async listPortfolioImages(userId: string): Promise<PortfolioImage[]> {
    const master = await this.getByUserId(userId);

    return this.prisma.db.portfolioImage.findMany({
      where: { masterProfileId: master.id },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addPortfolioImage(userId: string, dto: CreatePortfolioImageDto): Promise<PortfolioImage> {
    const master = await this.getByUserId(userId);

    const count = await this.prisma.db.portfolioImage.count({
      where: { masterProfileId: master.id },
    });
    if (count >= PORTFOLIO_IMAGE_LIMIT) {
      throw new PortfolioLimitExceededException();
    }

    await this.files.getAttachable(dto.fileId, userId, FilePurpose.PORTFOLIO_IMAGE);

    return this.prisma.db.portfolioImage.create({
      data: {
        masterProfileId: master.id,
        fileId: dto.fileId,
        sortOrder: count,
        ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
      },
    });
  }

  /** Idempotent — removing an already-removed image is a no-op. */
  async removePortfolioImage(userId: string, imageId: string): Promise<void> {
    const master = await this.getByUserId(userId);

    await this.prisma.db.portfolioImage.updateMany({
      where: { id: imageId, masterProfileId: master.id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Replaces every image's `sortOrder` with its position in `imageIds`. The set must
   * be exactly the caller's current live images — a partial or foreign id list is
   * rejected rather than silently reordering a subset.
   */
  async reorderPortfolio(userId: string, imageIds: string[]): Promise<PortfolioImage[]> {
    const master = await this.getByUserId(userId);

    const existing = await this.prisma.db.portfolioImage.findMany({
      where: { masterProfileId: master.id, deletedAt: null },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((image) => image.id));

    if (imageIds.length !== existingIds.size || imageIds.some((id) => !existingIds.has(id))) {
      throw new PortfolioImageNotFoundException();
    }

    await this.prisma.$transaction(
      imageIds.map((id, sortOrder) =>
        this.prisma.db.portfolioImage.update({ where: { id }, data: { sortOrder } }),
      ),
    );

    return this.prisma.db.portfolioImage.findMany({
      where: { masterProfileId: master.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
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
