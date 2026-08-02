import { Injectable } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import type { WorkingDay } from '@prisma/client';

import { FilesService } from '@modules/files/services/files.service';
import { PrismaService } from '@prisma-lib/prisma.service';

import type { AdminMasterSearchQueryDto } from '../dto/requests/admin-master-search-query.dto';
import { AdminMasterListItemResponseDto } from '../dto/responses/admin-master-list-item.response.dto';
import { MasterCertificatePublicResponseDto } from '../dto/responses/master-certificate-public.response.dto';
import {
  MasterMediaResponseDto,
  MasterPortfolioImageUrlDto,
} from '../dto/responses/master-media.response.dto';
import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';
import { MasterServiceResponseDto } from '../dto/responses/master-service.response.dto';
import { MasterNotFoundException } from '../exceptions/masters.exceptions';

/** Shared with `SearchService` (F-08) — one public projection, one place it is built. */
export const MASTER_PUBLIC_INCLUDE = {
  city: { select: { name: true } },
  categories: { include: { category: { select: { name: true } } } },
  services: { where: { isActive: true }, select: { price: true } },
  certificates: {
    where: { deletedAt: null, verifiedAt: { not: null } },
    select: { id: true },
    take: 1,
  },
  portfolioImages: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: { fileId: true },
  },
} satisfies Prisma.MasterProfileInclude;

export type MasterRow = Prisma.MasterProfileGetPayload<{ include: typeof MASTER_PUBLIC_INCLUDE }>;

const ADMIN_MASTER_INCLUDE = {
  ...MASTER_PUBLIC_INCLUDE,
  user: { select: { email: true, phone: true } },
} satisfies Prisma.MasterProfileInclude;

type AdminMasterRow = Prisma.MasterProfileGetPayload<{ include: typeof ADMIN_MASTER_INCLUDE }>;

const toAdminMasterListItemDto = (row: AdminMasterRow): AdminMasterListItemResponseDto => {
  const dto = new AdminMasterListItemResponseDto();
  const prices = row.services.map((service) => service.price);

  dto.id = row.id;
  dto.displayName = row.displayName;
  dto.email = row.user.email;
  dto.phone = row.user.phone;
  dto.cityName = row.city.name;
  dto.categories = row.categories.map((entry) => entry.category.name);
  dto.approvalStatus = row.approvalStatus;
  dto.isActive = row.isActive;
  dto.ratingAverage = row.ratingAverage.toFixed(2);
  dto.ratingCount = row.ratingCount;
  dto.priceFrom =
    prices.length === 0
      ? null
      : prices.reduce((min, price) => (price < min ? price : min)).toFixed(2);
  dto.createdAt = row.createdAt;

  return dto;
};

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
  dto.avatarUrl = null;
  dto.bannerFileId = row.bannerFileId;
  dto.bio =
    row.bio !== null && truncateBio && row.bio.length > BIO_PREVIEW_LENGTH
      ? `${row.bio.slice(0, BIO_PREVIEW_LENGTH)}…`
      : row.bio;
  dto.yearsOfExperience = row.yearsOfExperience;
  dto.serviceRadiusKm = row.serviceRadiusKm;
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
  dto.portfolioImageFileIds = row.portfolioImages.map((image) => image.fileId);

  return dto;
};

/**
 * API.md §7/§8 — single-master public projections. `GET /masters` (search & filter)
 * lives in `SearchModule` (F-08), which composes this module with `ScheduleModule` for
 * `availableOn` and needs a raw-SQL ranking query this service has no reason to own.
 */
@Injectable()
export class MastersSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async getPublicProfile(id: string): Promise<MasterPublicResponseDto> {
    this.assertUuid(id);

    const row = await this.prisma.db.masterProfile.findFirst({
      where: { id, approvalStatus: ApprovalStatus.APPROVED, isActive: true },
      include: MASTER_PUBLIC_INCLUDE,
    });

    if (row === null) {
      throw new MasterNotFoundException();
    }

    // Fire-and-forget — a view counter must not slow down or fail the profile response.
    this.prisma.db.masterProfile
      .update({ where: { id }, data: { profileViews: { increment: 1 } } })
      .catch(() => {});

    return toMasterPublicDto(row, false);
  }

  /**
   * Guards the public `:id` wildcards. Express registers `masters/:id/*` with no
   * specificity preference, so a stray `me` (e.g. `/masters/me/media`) would reach
   * Prisma and die on the UUID cast — a 500. Non-UUID ids are simply "not found".
   */
  private assertUuid(id: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new MasterNotFoundException();
    }
  }

  /**
   * Mints short-lived read URLs for every avatar in a search page. Presigning is
   * local and cheap, so this is one extra file lookup per non-empty avatar.
   */
  async mintAvatarUrls(items: MasterPublicResponseDto[]): Promise<MasterPublicResponseDto[]> {
    const ids = [
      ...new Set(items.map((item) => item.avatarFileId).filter((id): id is string => id !== null)),
    ];

    if (ids.length === 0) {
      return items;
    }

    const files = await this.prisma.db.file.findMany({
      where: { id: { in: ids }, isConfirmed: true, deletedAt: null },
      select: { id: true, key: true },
    });
    const keyById = new Map(files.map((file) => [file.id, file.key]));

    await Promise.all(
      items.map(async (item) => {
        const key = item.avatarFileId === null ? undefined : keyById.get(item.avatarFileId);
        item.avatarUrl = key === undefined ? null : await this.files.createReadUrlForKey(key);
      }),
    );

    return items;
  }

  /** All visual media of a public master, as short-lived URLs (F-07, API.md §7). */
  async getPublicMedia(masterId: string): Promise<MasterMediaResponseDto> {
    await this.assertPublic(masterId);

    const row = await this.prisma.db.masterProfile.findUnique({
      where: { id: masterId },
      select: {
        avatarFileId: true,
        bannerFileId: true,
        portfolioImages: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: { fileId: true, caption: true },
        },
      },
    });

    if (row === null) {
      throw new MasterNotFoundException();
    }

    const fileIds = [
      row.avatarFileId,
      row.bannerFileId,
      ...row.portfolioImages.map((image) => image.fileId),
    ].filter((id): id is string => id !== null);

    const files = await this.prisma.db.file.findMany({
      where: { id: { in: fileIds }, isConfirmed: true, deletedAt: null },
      select: { id: true, key: true },
    });
    const keyById = new Map(files.map((file) => [file.id, file.key]));

    const urlFor = async (fileId: string | null): Promise<string | null> => {
      const key = fileId === null ? undefined : keyById.get(fileId);
      return key === undefined ? null : this.files.createReadUrlForKey(key);
    };

    const [avatarUrl, bannerUrl] = await Promise.all([
      urlFor(row.avatarFileId),
      urlFor(row.bannerFileId),
    ]);

    const dto = new MasterMediaResponseDto();

    dto.avatarUrl = avatarUrl;
    dto.bannerUrl = bannerUrl;
    dto.portfolio = (
      await Promise.all(
        row.portfolioImages.map(async (image) => ({
          fileId: image.fileId,
          caption: image.caption,
          url: await urlFor(image.fileId),
        })),
      )
    ).filter((image): image is MasterPortfolioImageUrlDto => image.url !== null);

    return dto;
  }

  async assertPublic(id: string): Promise<void> {
    this.assertUuid(id);

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

  /** Public certificate list of an approved master, newest first. */
  async getPublicCertificates(masterId: string): Promise<MasterCertificatePublicResponseDto[]> {
    await this.assertPublic(masterId);

    const certificates = await this.prisma.db.certificate.findMany({
      where: { masterProfileId: masterId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return certificates.map((certificate) => {
      const dto = new MasterCertificatePublicResponseDto();

      dto.id = certificate.id;
      dto.title = certificate.title;
      dto.issuedBy = certificate.issuedBy;
      dto.issuedAt = certificate.issuedAt?.toISOString() ?? null;
      dto.verifiedAt = certificate.verifiedAt?.toISOString() ?? null;
      dto.fileId = certificate.fileId;

      return dto;
    });
  }

  /** Public weekly working hours of an approved master, ordered by weekday. */
  async getPublicSchedule(masterId: string): Promise<WorkingDay[]> {
    await this.assertPublic(masterId);

    return this.prisma.db.workingDay.findMany({
      where: { masterProfileId: masterId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  /** API.md §12 — every master regardless of approval/active state, unlike public search. */
  async adminSearch(
    query: AdminMasterSearchQueryDto,
  ): Promise<{ items: AdminMasterListItemResponseDto[]; total: number }> {
    const where: Prisma.MasterProfileWhereInput = {
      deletedAt: null,
      ...(query.approvalStatus !== undefined && { approvalStatus: query.approvalStatus }),
      ...(query.status !== undefined && { isActive: query.status }),
      ...(query.cityId !== undefined && { cityId: query.cityId }),
      ...(query.categoryId !== undefined && {
        categories: { some: { categoryId: query.categoryId } },
      }),
      ...(query.search !== undefined && {
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.db.masterProfile.findMany({
        where,
        include: ADMIN_MASTER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.masterProfile.count({ where }),
    ]);

    return { items: rows.map(toAdminMasterListItemDto), total };
  }
}
