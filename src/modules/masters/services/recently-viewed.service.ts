import { Injectable } from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { Locale } from '@common/utils/locale.util';
import { PrismaService } from '@prisma-lib/prisma.service';

import { MASTER_PUBLIC_SELECT, toMasterPublicDto } from './master-public.mapper';
import { RECENTLY_VIEWED_LIMIT } from '../constants/masters.constants';
import type { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MasterNotFoundException } from '../exceptions/masters.exceptions';

/**
 * A client's browsing history of master profiles. Follows `FavoritesService`'s exact
 * shape: one row per (client, master) pair, the same public projection. `viewedAt` is
 * bumped on every subsequent view via `upsert` rather than inserting a new row, so the
 * table stays bounded by "distinct masters ever viewed", not by page-view count.
 */
@Injectable()
export class RecentlyViewedService {
  constructor(private readonly prisma: PrismaService) {}

  async recordView(userId: string, masterProfileId: string): Promise<void> {
    const clientProfileId = await this.clientProfileId(userId);

    const master = await this.prisma.db.masterProfile.findFirst({
      where: { id: masterProfileId, approvalStatus: ApprovalStatus.APPROVED, isActive: true },
      select: { id: true },
    });
    if (master === null) {
      throw new MasterNotFoundException();
    }

    await this.prisma.db.recentlyViewedMaster.upsert({
      where: { clientProfileId_masterProfileId: { clientProfileId, masterProfileId } },
      update: { viewedAt: new Date() },
      create: { clientProfileId, masterProfileId },
    });
  }

  async list(userId: string, locale: Locale = 'en'): Promise<MasterPublicResponseDto[]> {
    const clientProfileId = await this.clientProfileId(userId);

    const views = await this.prisma.db.recentlyViewedMaster.findMany({
      where: { clientProfileId },
      orderBy: { viewedAt: 'desc' },
      take: RECENTLY_VIEWED_LIMIT,
      include: { masterProfile: { select: MASTER_PUBLIC_SELECT } },
    });

    return views.map((view) => toMasterPublicDto(view.masterProfile, true, locale));
  }

  private async clientProfileId(userId: string): Promise<string> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    return clientProfile.id;
  }
}
