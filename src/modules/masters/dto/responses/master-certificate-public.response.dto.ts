import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Visible certificates of an approved master — file id, not the bytes (API.md §7). */
export class MasterCertificatePublicResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  issuedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  issuedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Set when an admin verified it' })
  verifiedAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;
}
