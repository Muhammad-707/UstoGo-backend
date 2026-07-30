import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BannerPosition, type Banner } from '@prisma/client';

/** Never the Prisma entity directly (CLAUDE.md §5) — `deletedAt` stays server-side. */
export class BannerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  subtitle!: string | null;

  @ApiProperty({ format: 'uuid' })
  imageFileId!: string;

  @ApiPropertyOptional({ nullable: true })
  linkUrl!: string | null;

  @ApiProperty({ enum: BannerPosition })
  position!: BannerPosition;

  @ApiProperty()
  sortOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  startsAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  endsAt!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'uuid' })
  createdByUserId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  static fromEntity(entity: Banner): BannerResponseDto {
    const dto = new BannerResponseDto();

    dto.id = entity.id;
    dto.title = entity.title;
    dto.subtitle = entity.subtitle;
    dto.imageFileId = entity.imageFileId;
    dto.linkUrl = entity.linkUrl;
    dto.position = entity.position;
    dto.sortOrder = entity.sortOrder;
    dto.startsAt = entity.startsAt?.toISOString() ?? null;
    dto.endsAt = entity.endsAt?.toISOString() ?? null;
    dto.isActive = entity.isActive;
    dto.createdByUserId = entity.createdByUserId;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();

    return dto;
  }
}
