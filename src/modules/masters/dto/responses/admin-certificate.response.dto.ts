import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Certificate } from '@prisma/client';

type CertificateWithMaster = Certificate & {
  masterProfile: { id: string; displayName: string };
};

/** `GET /admin/certificates` (MASTER_PROMPT.md §6.17) — the master context an admin
 *  needs to judge a certificate, unlike the master's own `CertificateResponseDto`. */
export class AdminCertificateResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  masterId!: string;

  @ApiProperty()
  masterDisplayName!: string;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  issuedBy!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  issuedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  verifiedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: CertificateWithMaster): AdminCertificateResponseDto {
    const dto = new AdminCertificateResponseDto();

    dto.id = entity.id;
    dto.masterId = entity.masterProfileId;
    dto.masterDisplayName = entity.masterProfile.displayName;
    dto.fileId = entity.fileId;
    dto.title = entity.title;
    dto.issuedBy = entity.issuedBy;
    dto.issuedAt = entity.issuedAt;
    dto.verifiedAt = entity.verifiedAt;
    dto.createdAt = entity.createdAt;

    return dto;
  }
}
