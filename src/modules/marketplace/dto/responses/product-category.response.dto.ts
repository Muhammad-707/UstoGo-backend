import { ApiProperty } from '@nestjs/swagger';
import type { ProductCategory } from '@prisma/client';

export class ProductCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  static fromEntity(entity: ProductCategory): ProductCategoryResponseDto {
    const dto = new ProductCategoryResponseDto();

    dto.id = entity.id;
    dto.name = entity.name;
    dto.slug = entity.slug;
    dto.sortOrder = entity.sortOrder;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt.toISOString();

    return dto;
  }
}
