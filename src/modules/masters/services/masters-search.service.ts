import { Injectable } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { MasterSort, type MasterSearchQueryDto } from '../dto/requests/master-search-query.dto';
import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MasterServiceResponseDto } from '../dto/responses/master-service.response.dto';
import { MasterNotFoundException } from '../exceptions/masters.exceptions';

const PUBLIC_INCLUDE = {
  city: { select: { name: true } },
  categories: { include: { category: { select: { name: true } } } },
  services: { where: { isActive: true }, select: { price: true } },
  certificates: { where: { deletedAt: null }, select: { id: true }, take: 1 },
} satisfies Prisma.MasterProfileInclude;

type MasterRow = Prisma.MasterProfileGetPayload<{ include: typeof PUBLIC_INCLUDE }>;

const BIO_PREVIEW_LENGTH = 200;

const toPublicDto = (row: MasterRow, truncateBio: boolean): MasterPublicResponseDto => {
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
 * `price:asc`/`price:desc` fall back to `ratingAverage` — Prisma's relation `orderBy`
 * supports `_count` on a to-many relation but not `_min`/`_max` on one of its fields,
 * and sorting on an aggregate that needs its own query would mean paginating in
 * memory. Correct price ordering needs a raw aggregate query; deferred with search
 * (F-08, Phase 3), which is what actually needs a real ranking engine.
 */
const orderByFor = (sort: MasterSort | undefined): Prisma.MasterProfileOrderByWithRelationInput => {
  switch (sort) {
    case MasterSort.CREATED_DESC:
      return { createdAt: 'desc' };
    case MasterSort.PRICE_ASC:
    case MasterSort.PRICE_DESC:
    case MasterSort.RATING_DESC:
    default:
      return { ratingAverage: 'desc' };
  }
};

/** API.md §7 — public discovery. Never exposes email, phone or address. */
@Injectable()
export class MastersSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: MasterSearchQueryDto,
  ): Promise<{ items: MasterPublicResponseDto[]; total: number }> {
    const where = this.whereFor(query);

    const [rows, total] = await Promise.all([
      this.prisma.db.masterProfile.findMany({
        where,
        include: PUBLIC_INCLUDE,
        orderBy: orderByFor(query.sort),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.masterProfile.count({ where }),
    ]);

    return { items: rows.map((row) => toPublicDto(row, true)), total };
  }

  async getPublicProfile(id: string): Promise<MasterPublicResponseDto> {
    const row = await this.prisma.db.masterProfile.findFirst({
      where: { id, approvalStatus: ApprovalStatus.APPROVED, isActive: true },
      include: PUBLIC_INCLUDE,
    });

    if (row === null) {
      throw new MasterNotFoundException();
    }

    return toPublicDto(row, false);
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

  private whereFor(query: MasterSearchQueryDto): Prisma.MasterProfileWhereInput {
    return {
      approvalStatus: ApprovalStatus.APPROVED,
      isActive: true,
      ...(query.cityId !== undefined ? { cityId: query.cityId } : {}),
      ...(query.minRating !== undefined ? { ratingAverage: { gte: query.minRating } } : {}),
      ...(query.categoryId !== undefined
        ? { categories: { some: { categoryId: query.categoryId } } }
        : {}),
      ...(query.hasCertificates === true ? { certificates: { some: { deletedAt: null } } } : {}),
      ...(query.search !== undefined
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { bio: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            services: {
              some: {
                isActive: true,
                ...(query.minPrice !== undefined ? { price: { gte: query.minPrice } } : {}),
                ...(query.maxPrice !== undefined ? { price: { lte: query.maxPrice } } : {}),
              },
            },
          }
        : {}),
    };
  }
}
