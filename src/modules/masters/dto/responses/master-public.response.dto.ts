import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalStatus } from '@prisma/client';

/** API.md §7 — never email, phone or address. */
export class MasterPublicResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  avatarFileId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Short-lived read URL, when an avatar exists',
  })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  bannerFileId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bio!: string | null;

  @ApiProperty({ example: 8 })
  yearsOfExperience!: number;

  @ApiProperty({ example: 15 })
  serviceRadiusKm!: number;

  @ApiProperty()
  cityName!: string;

  @ApiProperty({ type: String, isArray: true })
  categories!: string[];

  @ApiProperty()
  ratingAverage!: string;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty()
  completedBookingsCount!: number;

  @ApiPropertyOptional({ nullable: true, description: 'The lowest active service price.' })
  priceFrom!: string | null;

  @ApiProperty()
  hasCertificates!: boolean;

  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    description: 'Portfolio image file ids, in display order (B-45).',
  })
  portfolioImageFileIds!: string[];

  @ApiProperty({
    description:
      'Always true on /masters (search) and GET /masters/:id, which only ever return ' +
      'APPROVED + active masters. Meaningful on GET /favorites, which does not filter — ' +
      'a favorited master can go inactive or lose approval without disappearing silently.',
  })
  isActive!: boolean;

  @ApiProperty({ enum: ApprovalStatus })
  approvalStatus!: ApprovalStatus;
}
