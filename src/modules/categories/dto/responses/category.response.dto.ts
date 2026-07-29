import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Category } from '@prisma/client';

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

  static fromNode(node: CategoryNode): CategoryResponseDto {
    const dto = new CategoryResponseDto();

    dto.id = node.id;
    dto.slug = node.slug;
    dto.name = node.name;
    dto.description = node.description;
    dto.iconFileId = node.iconFileId;
    dto.depth = node.depth;
    dto.sortOrder = node.sortOrder;
    dto.isLeaf = node.isLeaf;
    dto.children = node.children.map((child) => CategoryResponseDto.fromNode(child));

    return dto;
  }

  /** For the admin mutation responses, which return the row itself, not a tree fetch. */
  static fromEntity(entity: Category): CategoryResponseDto {
    const dto = new CategoryResponseDto();

    dto.id = entity.id;
    dto.slug = entity.slug;
    dto.name = entity.name;
    dto.description = entity.description;
    dto.iconFileId = entity.iconFileId;
    dto.depth = entity.depth;
    dto.sortOrder = entity.sortOrder;
    dto.isLeaf = true;
    dto.children = [];

    return dto;
  }
}
