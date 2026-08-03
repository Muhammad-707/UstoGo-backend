import { Injectable } from '@nestjs/common';
import { FilePurpose, type Category } from '@prisma/client';

import type { Locale } from '@common/utils/locale.util';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import { FilesService } from '../../files/services/files.service';
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_DEPTH,
  TREE_CACHE_TTL_MS,
} from '../constants/category.constants';
import { buildCategoryTree, toNodeFields, type CategoryNode } from '../domain/category-tree.util';
import { reparent } from '../domain/subtree.util';
import type { CreateCategoryDto } from '../dto/requests/create-category.dto';
import type { UpdateCategoryDto } from '../dto/requests/update-category.dto';
import { CategoryResponseDto } from '../dto/responses/category.response.dto';
import {
  CategoryDepthExceededException,
  CategoryInUseException,
  CategoryNotFoundException,
  CategorySlugTakenException,
} from '../exceptions/categories.exceptions';

type TreeCache = { readonly expiresAt: number; readonly tree: CategoryNode[] };

type TranslatableFields = {
  name?: string;
  nameTj?: string;
  nameRu?: string;
  description?: string;
  descriptionTj?: string;
  descriptionRu?: string;
};

/** Only the keys the caller actually sent — undefined stays undefined, never overwrites. */
const translatablePatch = (dto: TranslatableFields): TranslatableFields => ({
  ...(dto.name !== undefined ? { name: dto.name } : {}),
  ...(dto.nameTj !== undefined ? { nameTj: dto.nameTj } : {}),
  ...(dto.nameRu !== undefined ? { nameRu: dto.nameRu } : {}),
  ...(dto.description !== undefined ? { description: dto.description } : {}),
  ...(dto.descriptionTj !== undefined ? { descriptionTj: dto.descriptionTj } : {}),
  ...(dto.descriptionRu !== undefined ? { descriptionRu: dto.descriptionRu } : {}),
});

@Injectable()
export class CategoriesService {
  /**
   * In-process only — every instance builds its own for up to `TREE_CACHE_TTL_MS`
   * (FR-5.1). Sharing it across instances via Redis is B-60; the tree is reference
   * data cheap enough to rebuild per instance until that lands.
   */
  private treeCache: TreeCache | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionManager,
    private readonly files: FilesService,
  ) {}

  async getTree(): Promise<CategoryNode[]> {
    const now = Date.now();

    if (this.treeCache !== null && this.treeCache.expiresAt > now) {
      return this.treeCache.tree;
    }

    const rows = await this.prisma.db.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: MAX_CATEGORIES,
    });

    const tree = buildCategoryTree(rows);
    this.treeCache = { expiresAt: now + TREE_CACHE_TTL_MS, tree };

    return tree;
  }

  /** Ancestors are root-first; the chain and the category itself must all be active. */
  async getBySlug(slug: string, locale: Locale = 'en'): Promise<CategoryResponseDto> {
    const category = await this.prisma.db.category.findFirst({ where: { slug, isActive: true } });

    if (category === null) {
      throw new CategoryNotFoundException();
    }

    const ancestors: Category[] = [];
    let parentId = category.parentId;

    while (parentId !== null) {
      const parent = await this.prisma.db.category.findFirst({
        where: { id: parentId, isActive: true },
      });

      if (parent === null) {
        throw new CategoryNotFoundException();
      }

      ancestors.unshift(parent);
      parentId = parent.parentId;
    }

    const children = await this.prisma.db.category.findMany({
      where: { parentId: category.id, isActive: true },
      include: { _count: { select: { children: { where: { isActive: true } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const node: CategoryNode = {
      ...toNodeFields(category),
      isLeaf: children.length === 0,
      children: children.map((child) => ({
        ...toNodeFields(child),
        children: [],
        isLeaf: child._count.children === 0,
      })),
    };

    const dto = CategoryResponseDto.fromNode(node, locale);
    dto.ancestors = ancestors.map((ancestor) => CategoryResponseDto.fromEntity(ancestor, locale));

    return dto;
  }

  async create(dto: CreateCategoryDto, adminUserId: string): Promise<Category> {
    await this.assertSlugAvailable(dto.slug);

    if (dto.iconFileId !== undefined) {
      await this.files.getAttachable(dto.iconFileId, adminUserId, FilePurpose.CATEGORY_ICON);
    }

    let depth = 1;

    if (dto.parentId !== undefined) {
      const parent = await this.prisma.db.category.findUnique({ where: { id: dto.parentId } });

      if (parent === null) {
        throw new CategoryNotFoundException();
      }
      if (parent.depth >= MAX_CATEGORY_DEPTH) {
        throw new CategoryDepthExceededException();
      }
      depth = parent.depth + 1;
    }

    const created = await this.prisma.db.category.create({
      data: {
        ...translatablePatch(dto),
        name: dto.name,
        slug: dto.slug,
        depth,
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.iconFileId !== undefined ? { iconFileId: dto.iconFileId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    this.invalidateTreeCache();

    return created;
  }

  async update(id: string, dto: UpdateCategoryDto, adminUserId: string): Promise<Category> {
    const current = await this.findByIdOrThrow(id);

    if (dto.iconFileId !== undefined && dto.iconFileId !== null) {
      await this.files.getAttachable(dto.iconFileId, adminUserId, FilePurpose.CATEGORY_ICON);
    }

    const updated = await this.tx.run(async (tx) => {
      const data: Record<string, unknown> = {
        ...translatablePatch(dto),
        ...(dto.iconFileId !== undefined ? { iconFileId: dto.iconFileId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      };

      if (dto.parentId !== undefined && dto.parentId !== current.parentId) {
        const result = await reparent(tx, id, current.depth, dto.parentId);

        data.parentId = result.parentId;
        data.depth = result.depth;
      }

      return tx.category.update({ where: { id }, data });
    });

    if (
      dto.iconFileId !== undefined &&
      current.iconFileId !== null &&
      current.iconFileId !== dto.iconFileId
    ) {
      await this.files.softDelete(current.iconFileId);
    }

    this.invalidateTreeCache();

    return updated;
  }

  /** BR-22: blocked by any live child; deactivation (PATCH isActive) is the alternative. */
  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);

    const child = await this.prisma.db.category.findFirst({ where: { parentId: id } });

    if (child !== null) {
      throw new CategoryInUseException();
    }

    await this.prisma.db.category.update({ where: { id }, data: { deletedAt: new Date() } });
    this.invalidateTreeCache();
  }

  private async findByIdOrThrow(id: string): Promise<Category> {
    const category = await this.prisma.db.category.findUnique({ where: { id } });

    if (category === null) {
      throw new CategoryNotFoundException();
    }

    return category;
  }

  private async assertSlugAvailable(slug: string): Promise<void> {
    const existing = await this.prisma.db.category.findUnique({ where: { slug } });

    if (existing !== null) {
      throw new CategorySlugTakenException();
    }
  }

  private invalidateTreeCache(): void {
    this.treeCache = null;
  }
}
