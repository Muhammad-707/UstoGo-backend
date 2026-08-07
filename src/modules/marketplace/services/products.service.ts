import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import { ProductCategoriesService } from './product-categories.service';
import { PRODUCT_WITH_IMAGES_INCLUDE, type ProductRow } from './product-includes';
import type { CreateProductDto } from '../dto/requests/create-product.dto';
import type { ProductsQueryDto } from '../dto/requests/products-query.dto';
import type { UpdateProductDto } from '../dto/requests/update-product.dto';
import { ProductNotFoundException } from '../exceptions/marketplace.exceptions';

export type ProductPage = { readonly items: ProductRow[]; readonly total: number };

const searchFilter = (search: string | undefined): Prisma.ProductWhereInput =>
  search !== undefined ? { name: { contains: search, mode: 'insensitive' } } : {};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: ProductCategoriesService,
    private readonly transactionManager: TransactionManager,
    private readonly config: AppConfigService,
  ) {}

  /** `GET /products` — public, active products only. */
  async listPublic(query: ProductsQueryDto): Promise<ProductPage> {
    return this.list(
      {
        isActive: true,
        ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
        ...searchFilter(query.search),
      },
      query,
    );
  }

  /** `GET /admin/products` — every product, active or not. */
  async listForAdmin(query: ProductsQueryDto): Promise<ProductPage> {
    return this.list(
      {
        ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
        ...searchFilter(query.search),
      },
      query,
    );
  }

  private async list(
    where: Prisma.ProductWhereInput,
    query: ProductsQueryDto,
  ): Promise<ProductPage> {
    const [items, total] = await Promise.all([
      this.prisma.db.product.findMany({
        where,
        include: PRODUCT_WITH_IMAGES_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.product.count({ where }),
    ]);

    return { items, total };
  }

  /** Public detail — 404 for an inactive/deleted product, same as a foreign resource. */
  async getPublicById(id: string): Promise<ProductRow> {
    const product = await this.prisma.db.product.findFirst({
      where: { id, isActive: true },
      include: PRODUCT_WITH_IMAGES_INCLUDE,
    });

    if (product === null) {
      throw new ProductNotFoundException();
    }

    return product;
  }

  async getForAdmin(id: string): Promise<ProductRow> {
    return this.findByIdOrThrow(id);
  }

  async create(dto: CreateProductDto): Promise<ProductRow> {
    await this.categories.findByIdOrThrow(dto.categoryId);

    const created = await this.transactionManager.run((tx) =>
      tx.product.create({
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description,
          price: dto.price,
          currency: this.config.catalogue.currency,
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          images: {
            create: dto.imageUrls.map((imageUrl, index) => ({ imageUrl, sortOrder: index })),
          },
        },
        include: PRODUCT_WITH_IMAGES_INCLUDE,
      }),
    );

    return created;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductRow> {
    await this.findByIdOrThrow(id);

    if (dto.categoryId !== undefined) {
      await this.categories.findByIdOrThrow(dto.categoryId);
    }

    return this.transactionManager.run(async (tx) => {
      if (dto.imageUrls !== undefined) {
        await tx.productImage.deleteMany({ where: { productId: id } });
      }

      return tx.product.update({
        where: { id },
        data: {
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.imageUrls !== undefined
            ? {
                images: {
                  create: dto.imageUrls.map((imageUrl, index) => ({ imageUrl, sortOrder: index })),
                },
              }
            : {}),
        },
        include: PRODUCT_WITH_IMAGES_INCLUDE,
      });
    });
  }

  /** Soft delete — an already-purchased `OrderItem` keeps its own frozen snapshot. */
  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.db.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  private async findByIdOrThrow(id: string): Promise<ProductRow> {
    const product = await this.prisma.db.product.findUnique({
      where: { id },
      include: PRODUCT_WITH_IMAGES_INCLUDE,
    });

    if (product === null) {
      throw new ProductNotFoundException();
    }

    return product;
  }
}
