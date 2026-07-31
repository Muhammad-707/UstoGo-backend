import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PortfolioImage } from '@prisma/client';

export class PortfolioImageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiPropertyOptional({ nullable: true })
  caption!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: PortfolioImage): PortfolioImageResponseDto {
    const dto = new PortfolioImageResponseDto();

    dto.id = entity.id;
    dto.fileId = entity.fileId;
    dto.caption = entity.caption;
    dto.sortOrder = entity.sortOrder;
    dto.createdAt = entity.createdAt;

    return dto;
  }
}
