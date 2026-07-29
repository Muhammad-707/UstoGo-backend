import { Injectable } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MasterServiceResponseDto } from '../dto/responses/master-service.response.dto';
import { MasterNotFoundException } from '../exceptions/masters.exceptions';

/** Shared with `SearchService` (F-08) — one public projection, one place it is built. */
export const MASTER_PUBLIC_INCLUDE = {
  city: { select: { name: true } },
  categories: { include: { category: { select: { name: true } } } },
  services: { where: { isActive: true }, select: { price: true } },
  certificates: { where: { deletedAt: null }, select: { id: true }, take: 1 },
} satisfies Prisma.MasterProfileInclude;

export type MasterRow = Prisma.MasterProfileGetPayload<{ include: typeof MASTER_PUBLIC_INCLUDE }>;

const BIO_PREVIEW_LENGTH = 200;

export const toMasterPublicDto = (
  row: MasterRow,
  truncateBio: boolean,
): MasterPublicResponseDto => {
  const dto = new MasterPublicResponseDto();
  const prices = row.services.map((service) => service.price);

  dto.id = row.id;
  dto.displayName = row.displayName;
  dto.avatarFileId = row.avatarFileId;
  dto.bio =
    row.bio !== null && truncateBio && row.bio.length > BIO_PREVIEW_LENGTH
      ? `${row.bio.slice(0, BIO_PREVIEW_LENGTH)}…`
      : row.bio;
  dto.cityName = row.city.name;
  dto.categories = row.categories.map((entry) => entry.category.name);
  dto.ratingAverage = row.ratingAverage.toFixed(2);
  dto.ratingCount = row.ratingCount;
  dto.completedBookingsCount = row.completedBookingsCount;
  dto.priceFrom =
    prices.length === 0
      ? null
      : prices.reduce((min, price) => (price < min ? price : min)).toFixed(2);
  dto.hasCertificates = row.certificates.length > 0;

  return dto;
};

/**
 * API.md §7/§8 — single-master public projections. `GET /masters` (search & filter)
 * lives in `SearchModule` (F-08), which composes this module with `ScheduleModule` for
 * `availableOn` and needs a raw-SQL ranking query this service has no reason to own.
 */
@Injectable()
export class MastersSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicProfile(id: string): Promise<MasterPublicResponseDto> {
    const row = await this.prisma.db.masterProfile.findFirst({
      where: { id, approvalStatus: ApprovalStatus.APPROVED, isActive: true },
      include: MASTER_PUBLIC_INCLUDE,
    });

    if (row === null) {
      throw new MasterNotFoundException();
    }

    return toMasterPublicDto(row, false);
  }

  async assertPublic(id: string): Promise<void> {
    const row = await this.prisma.db.masterProfile.findFirst({
      where: { id, approvalStatus: ApprovalStatus.APPROVED, isActive: true },
      select: { id: true },
    });

    if (row === null) {
      throw new MasterNotFoundException();
    }
  }

  async getActiveServices(masterId: string): Promise<MasterServiceResponseDto[]> {
    await this.assertPublic(masterId);

    const services = await this.prisma.db.service.findMany({
      where: { masterProfileId: masterId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return services.map((service) => MasterServiceResponseDto.fromEntity(service));
  }
}
