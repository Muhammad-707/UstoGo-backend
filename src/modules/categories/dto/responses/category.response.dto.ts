import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Category } from '@prisma/client';

import { localize, localizeNullable, type Locale } from '@common/utils/locale.util';

import type { CategoryNode } from '../../domain/category-tree.util';

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  iconFileId!: string | null;

  @ApiProperty({ minimum: 1, maximum: 3 })
  depth!: number;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isLeaf!: boolean;

  @ApiProperty({ type: () => CategoryResponseDto, isArray: true })
  children!: CategoryResponseDto[];

  /** Root-first order. Only set by `GET /categories/:slug`. */
  @ApiPropertyOptional({ type: () => CategoryResponseDto, isArray: true })
  ancestors?: CategoryResponseDto[];

  static fromNode(node: CategoryNode, locale: Locale = 'en'): CategoryResponseDto {
    const dto = new CategoryResponseDto();

    dto.id = node.id;
    dto.slug = node.slug;
    dto.name = localize(node.name, node.nameTj, node.nameRu, locale);
    dto.description = localizeNullable(
      node.description,
      node.descriptionTj,
      node.descriptionRu,
      locale,
    );
    dto.iconFileId = node.iconFileId;
    dto.depth = node.depth;
    dto.sortOrder = node.sortOrder;
    dto.isLeaf = node.isLeaf;
    dto.children = node.children.map((child) => CategoryResponseDto.fromNode(child, locale));

    return dto;
  }

  /** For the admin mutation responses, which return the row itself, not a tree fetch. */
  static fromEntity(entity: Category, locale: Locale = 'en'): CategoryResponseDto {
    const dto = new CategoryResponseDto();

    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.name = localize(entity.name, entity.nameTj, entity.nameRu, locale);
    dto.description = localizeNullable(
      entity.description,
      entity.descriptionTj,
      entity.descriptionRu,
      locale,
    );
    dto.iconFileId = entity.iconFileId;
    dto.depth = entity.depth;
    dto.sortOrder = entity.sortOrder;
    dto.isLeaf = true;
    dto.children = [];

    return dto;
  }
}
