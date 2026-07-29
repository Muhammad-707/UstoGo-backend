import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Certificate } from '@prisma/client';

export class CertificateResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  issuedBy!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date' })
  issuedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: Certificate): CertificateResponseDto {
    const dto = new CertificateResponseDto();

    dto.id = entity.id;
    dto.fileId = entity.fileId;
    dto.title = entity.title;
    dto.issuedBy = entity.issuedBy;
    dto.issuedAt = entity.issuedAt;
    dto.createdAt = entity.createdAt;

    return dto;
  }
}
