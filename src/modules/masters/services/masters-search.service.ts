import { Injectable } from '@nestjs/common';
import { ApprovalStatus, BookingStatus, Prisma } from '@prisma/client';
import type { WorkingDay } from '@prisma/client';

import { FilesService } from '@modules/files/services/files.service';
import { PrismaService } from '@prisma-lib/prisma.service';

import { MASTER_PUBLIC_SELECT, toMasterPublicDto } from './master-public.mapper';
import {
  stockAvatarUrlFor,
  stockBannerUrlFor,
  stockGalleryFor,
} from '../constants/stock-media.constants';
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

/** Projection used by `GET /masters/:id/media` (F-07). */
const MASTER_MEDIA_SELECT = {
  displayName: true,
  avatarFileId: true,
  bannerFileId: true,
  categories: { select: { category: { select: { slug: true } } } },
  portfolioImages: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: { fileId: true, caption: true },
  },
} satisfies Prisma.MasterProfileSelect;

type MasterMediaRow = Prisma.MasterProfileGetPayload<{ select: typeof MASTER_MEDIA_SELECT }>;

const ADMIN_MASTER_SELECT = {
  ...MASTER_PUBLIC_SELECT,
  user: { select: { email: true, phone: true } },
} satisfies Prisma.MasterProfileSelect;

type AdminMasterRow = Prisma.MasterProfileGetPayload<{ select: typeof ADMIN_MASTER_SELECT }>;

const toAdminMasterListItemDto = (
  row: AdminMasterRow,
  totalEarnings: string,
): AdminMasterListItemResponseDto => {
  const dto = new AdminMasterListItemResponseDto();
  const prices = row.services.map((service) => service.price);

  dto.id = row.id;
  dto.displayName = row.displayName;
  dto.email = row.user.email;
  dto.phone = row.user.phone;
  dto.whatsappPhone = row.whatsappPhone;
  dto.cityName = row.city.name;
  dto.categories = row.categories.map((entry) => entry.category.name);
  dto.approvalStatus = row.approvalStatus;
  dto.isActive = row.isActive;
  dto.ratingAverage = row.ratingAverage.toFixed(2);
  dto.ratingCount = row.ratingCount;
  dto.completedBookingsCount = row.completedBookingsCount;
  dto.totalEarnings = totalEarnings;
  dto.priceFrom =
    prices.length === 0
      ? null
      : prices.reduce((min, price) => (price < min ? price : min)).toFixed(2);
  dto.createdAt = row.createdAt;

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
      select: MASTER_PUBLIC_SELECT,
    });

    if (row === null) {
      throw new MasterNotFoundException();
    }

    // Fire-and-forget — a view counter must not slow down or fail the profile response.
    void this.prisma.db.masterProfile
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
   * Masters without an uploaded avatar already carry a stock portrait
   * (`toMasterPublicDto`), so only real files are minted here.
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
        if (key !== undefined) {
          item.avatarUrl = await this.files.createReadUrlForKey(key);
        }
      }),
    );

    return items;
  }

  /** All visual media of a public master, as short-lived URLs (F-07, API.md §7). */
  async getPublicMedia(masterId: string): Promise<MasterMediaResponseDto> {
    await this.assertPublic(masterId);

    const row = await this.prisma.db.masterProfile.findUnique({
      where: { id: masterId },
      select: MASTER_MEDIA_SELECT,
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

    return this.buildMediaDto(row, new Map(files.map((file) => [file.id, file.key])));
  }

  /**
   * Demo masters without uploads get deterministic stock imagery instead of blanks:
   * gender-matched avatar, profession-scoped banner and portfolio gallery.
   */
  private async buildMediaDto(
    row: MasterMediaRow,
    keyById: Map<string, string>,
  ): Promise<MasterMediaResponseDto> {
    const categorySlug = row.categories[0]?.category.slug ?? null;

    const urlFor = async (fileId: string | null): Promise<string | null> => {
      const key = fileId === null ? undefined : keyById.get(fileId);
      return key === undefined ? null : this.files.createReadUrlForKey(key);
    };

    const [avatarUrl, bannerUrl] = await Promise.all([
      row.avatarFileId === null ? stockAvatarUrlFor(row.displayName) : urlFor(row.avatarFileId),
      row.bannerFileId === null ? stockBannerUrlFor(categorySlug) : urlFor(row.bannerFileId),
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

    if (dto.portfolio.length === 0) {
      dto.portfolio = stockGalleryFor(categorySlug).map((url, index) => ({
        fileId: `stock-${categorySlug ?? 'generic'}-${index + 1}`,
        caption: null,
        url,
      }));
    }

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
        select: ADMIN_MASTER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.masterProfile.count({ where }),
    ]);

    const earningsByMaster = await this.prisma.db.booking.groupBy({
      by: ['masterProfileId'],
      where: {
        masterProfileId: { in: rows.map((row) => row.id) },
        status: BookingStatus.COMPLETED,
      },
      _sum: { price: true },
    });
    const earningsById = new Map(
      earningsByMaster.map((row) => [row.masterProfileId, row._sum.price?.toFixed(2) ?? '0.00']),
    );
    return {
      items: rows.map((row) => toAdminMasterListItemDto(row, earningsById.get(row.id) ?? '0.00')),
      total,
    };
  }
}
