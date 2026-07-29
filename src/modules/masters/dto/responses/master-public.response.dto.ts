import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** API.md §7 — never email, phone or address. */
export class MasterPublicResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  avatarFileId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bio!: string | null;

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
}
