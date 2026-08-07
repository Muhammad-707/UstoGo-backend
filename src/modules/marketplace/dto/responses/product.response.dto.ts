import { ApiProperty } from '@nestjs/swagger';

export type ProductWithImages = {
  id: string;
  categoryId: string;
  category: { name: string };
  name: string;
  description: string;
  price: { toFixed: (n: number) => string };
  currency: string;
  isActive: boolean;
  createdAt: Date;
  images: { imageUrl: string }[];
};

/** Never the Prisma entity directly (CLAUDE.md §5) — `deletedAt` stays server-side. */
export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty()
  categoryName!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  price!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({
    type: [String],
    description: 'Display order — the first is the cover photo, the rest are for the gallery.',
  })
  imageUrls!: string[];

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  static fromEntity(entity: ProductWithImages): ProductResponseDto {
    const dto = new ProductResponseDto();

    dto.id = entity.id;
    dto.categoryId = entity.categoryId;
    dto.categoryName = entity.category.name;
    dto.name = entity.name;
    dto.description = entity.description;
    dto.price = entity.price.toFixed(2);
    dto.currency = entity.currency;
    dto.imageUrls = entity.images.map((image) => image.imageUrl);
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt.toISOString();

    return dto;
  }
}
