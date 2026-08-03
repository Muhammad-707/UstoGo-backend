import { Injectable } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import type { MasterPublicResponseDto } from '@modules/masters/dto/responses/master-public.response.dto';
import { MasterNotFoundException } from '@modules/masters/exceptions/masters.exceptions';
import {
  MASTER_PUBLIC_SELECT,
  toMasterPublicDto,
} from '@modules/masters/services/master-public.mapper';
import { PrismaService } from '@prisma-lib/prisma.service';

/** A client's saved-for-later master list — no relation to bookings or reviews. */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  private async clientProfileId(userId: string): Promise<string> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    return clientProfile.id;
  }

  async list(userId: string): Promise<MasterPublicResponseDto[]> {
    const clientProfileId = await this.clientProfileId(userId);

    const favorites = await this.prisma.db.favorite.findMany({
      where: { clientProfileId },
      orderBy: { createdAt: 'desc' },
      include: { masterProfile: { select: MASTER_PUBLIC_SELECT } },
    });

    return favorites.map((favorite) => toMasterPublicDto(favorite.masterProfile, true));
  }

  /** Idempotent — adding an already-favorited master is a no-op. */
  async add(userId: string, masterProfileId: string): Promise<void> {
    const clientProfileId = await this.clientProfileId(userId);

    const master = await this.prisma.db.masterProfile.findFirst({
      where: { id: masterProfileId, approvalStatus: 'APPROVED', isActive: true },
      select: { id: true },
    });
    if (master === null) {
      throw new MasterNotFoundException();
    }

    await this.prisma.db.favorite.upsert({
      where: { clientProfileId_masterProfileId: { clientProfileId, masterProfileId } },
      update: {},
      create: { clientProfileId, masterProfileId },
    });
  }

  /** Idempotent — removing a non-favorited master is a no-op. */
  async remove(userId: string, masterProfileId: string): Promise<void> {
    const clientProfileId = await this.clientProfileId(userId);

    await this.prisma.db.favorite.deleteMany({ where: { clientProfileId, masterProfileId } });
  }
}
