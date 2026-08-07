import { Injectable } from '@nestjs/common';
import type { Prisma, ProductCategory } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';

import type { CreateProductCategoryDto } from '../dto/requests/create-product-category.dto';
import type { UpdateProductCategoryDto } from '../dto/requests/update-product-category.dto';
import { ProductCategoryNotFoundException } from '../exceptions/marketplace.exceptions';

const updateData = (dto: UpdateProductCategoryDto): Prisma.ProductCategoryUpdateInput => ({
  ...(dto.name !== undefined ? { name: dto.name } : {}),
  ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
  ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
});

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /product-categories` — public, active only. */
  async listPublic(): Promise<ProductCategory[]> {
    return this.prisma.db.productCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });
  }

  /** `GET /admin/product-categories` — every category, active or not. */
  async listForAdmin(): Promise<ProductCategory[]> {
    return this.prisma.db.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  async create(dto: CreateProductCategoryDto): Promise<ProductCategory> {
    return this.prisma.db.productCategory.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async update(id: string, dto: UpdateProductCategoryDto): Promise<ProductCategory> {
    await this.findByIdOrThrow(id);

    return this.prisma.db.productCategory.update({ where: { id }, data: updateData(dto) });
  }

  /** Soft delete — products already attached keep their (now-inactive) category. */
  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.db.productCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async findByIdOrThrow(id: string): Promise<ProductCategory> {
    const category = await this.prisma.db.productCategory.findUnique({ where: { id } });

    if (category === null) {
      throw new ProductCategoryNotFoundException();
    }

    return category;
  }
}
