import { Injectable } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import { PRODUCT_WITH_IMAGES_INCLUDE, type ProductRow } from './product-includes';
import { ProductNotFoundException } from '../exceptions/marketplace.exceptions';

/** A client's wishlist — no relation to the cart or to orders. Mirrors `FavoritesService`. */
@Injectable()
export class ProductLikesService {
  constructor(private readonly prisma: PrismaService) {}

  private async clientProfileId(userId: string): Promise<string> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    return clientProfile.id;
  }

  async list(userId: string): Promise<ProductRow[]> {
    const clientProfileId = await this.clientProfileId(userId);

    const likes = await this.prisma.db.productLike.findMany({
      where: { clientProfileId },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: PRODUCT_WITH_IMAGES_INCLUDE } },
    });

    return likes.map((like) => like.product);
  }

  /** Idempotent — liking an already-liked product is a no-op. */
  async add(userId: string, productId: string): Promise<void> {
    const clientProfileId = await this.clientProfileId(userId);

    const product = await this.prisma.db.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true },
    });
    if (product === null) {
      throw new ProductNotFoundException();
    }

    await this.prisma.db.productLike.upsert({
      where: { clientProfileId_productId: { clientProfileId, productId } },
      update: {},
      create: { clientProfileId, productId },
    });
  }

  /** Idempotent — unliking a non-liked product is a no-op. */
  async remove(userId: string, productId: string): Promise<void> {
    const clientProfileId = await this.clientProfileId(userId);

    await this.prisma.db.productLike.deleteMany({ where: { clientProfileId, productId } });
  }
}
