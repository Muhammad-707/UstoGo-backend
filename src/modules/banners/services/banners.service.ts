import { Injectable } from '@nestjs/common';
import { FilePurpose, type Banner, type BannerPosition, type Prisma } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import { FilesService } from '../../files/services/files.service';
import type { CreateBannerDto } from '../dto/requests/create-banner.dto';
import type { UpdateBannerDto } from '../dto/requests/update-banner.dto';
import { BannerNotFoundException } from '../exceptions/banners.exceptions';

export type BannerPage = { readonly items: Banner[]; readonly total: number };

/** Only the fields present in the request become part of the `update` payload. */
const updateData = (
  dto: UpdateBannerDto,
  newImageFileId: string | undefined,
): Prisma.BannerUpdateInput => ({
  ...(newImageFileId !== undefined ? { imageFileId: newImageFileId } : {}),
  ...(dto.title !== undefined ? { title: dto.title } : {}),
  ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
  ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),
  ...(dto.position !== undefined ? { position: dto.position } : {}),
  ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
  ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
  ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
  ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
});

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /**
   * `GET /banners` (FR-11.2) — only banners currently active for `position`, ordered
   * for display. The window check is the `where` equivalent of
   * `domain/active-window.util.ts#isWithinActiveWindow`; that function carries the
   * exhaustive unit tests for the rule, this carries it in SQL.
   */
  async listPublic(position?: BannerPosition): Promise<Banner[]> {
    const now = new Date();

    return this.prisma.db.banner.findMany({
      where: {
        ...(position !== undefined ? { position } : {}),
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    });
  }

  /** `GET /admin/banners` (FR-11.2) — every banner, active or not. */
  async listForAdmin(page: number, limit: number): Promise<BannerPage> {
    const [items, total] = await Promise.all([
      this.prisma.db.banner.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.db.banner.count(),
    ]);

    return { items, total };
  }

  async getByIdForAdmin(id: string): Promise<Banner> {
    return this.findByIdOrThrow(id);
  }

  async create(dto: CreateBannerDto, adminUserId: string): Promise<Banner> {
    const image = await this.files.getAttachable(dto.imageKey, adminUserId, FilePurpose.BANNER);

    return this.prisma.db.banner.create({
      data: {
        title: dto.title,
        imageFileId: image.id,
        position: dto.position,
        createdByUserId: adminUserId,
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async update(id: string, dto: UpdateBannerDto, adminUserId: string): Promise<Banner> {
    const current = await this.findByIdOrThrow(id);

    let newImageFileId: string | undefined;

    if (dto.imageKey !== undefined) {
      const image = await this.files.getAttachable(dto.imageKey, adminUserId, FilePurpose.BANNER);
      newImageFileId = image.id;
    }

    const updated = await this.prisma.db.banner.update({
      where: { id },
      data: updateData(dto, newImageFileId),
    });

    if (newImageFileId !== undefined && current.imageFileId !== newImageFileId) {
      await this.files.softDelete(current.imageFileId);
    }

    return updated;
  }

  /** Soft delete (DATABASE.md §12); the image object is left for the cleanup job. */
  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.db.banner.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async findByIdOrThrow(id: string): Promise<Banner> {
    const banner = await this.prisma.db.banner.findUnique({ where: { id } });

    if (banner === null) {
      throw new BannerNotFoundException();
    }

    return banner;
  }
}
