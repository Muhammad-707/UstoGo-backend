import { Injectable } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import { MAX_ITEM_QUANTITY } from '../constants/marketplace.constants';
import type { CartItemWithProduct } from '../dto/responses/cart.response.dto';
import {
  CartItemNotFoundException,
  ProductNotFoundException,
} from '../exceptions/marketplace.exceptions';

const CART_ITEM_WITH_PRODUCT_INCLUDE = {
  product: {
    select: {
      name: true,
      price: true,
      currency: true,
      isActive: true,
      images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
    },
  },
};

/**
 * A client's running cart — `CartItem` rows scoped to the caller, no separate "Cart"
 * header entity (the cart *is* the set of a client's live rows, the same way
 * `Favorite` needs no separate "favorites list" entity).
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private async clientProfileId(userId: string): Promise<string> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    return clientProfile.id;
  }

  async list(userId: string): Promise<CartItemWithProduct[]> {
    const clientProfileId = await this.clientProfileId(userId);

    return this.prisma.db.cartItem.findMany({
      where: { clientProfileId },
      orderBy: { createdAt: 'desc' },
      include: CART_ITEM_WITH_PRODUCT_INCLUDE,
    });
  }

  /** Adding an already-present product increments its quantity, capped at the max. */
  async addItem(userId: string, productId: string, quantity: number): Promise<CartItemWithProduct> {
    const clientProfileId = await this.clientProfileId(userId);

    const product = await this.prisma.db.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true },
    });
    if (product === null) {
      throw new ProductNotFoundException();
    }

    const existing = await this.prisma.db.cartItem.findUnique({
      where: { clientProfileId_productId: { clientProfileId, productId } },
    });
    const nextQuantity = Math.min((existing?.quantity ?? 0) + quantity, MAX_ITEM_QUANTITY);

    const item = await this.prisma.db.cartItem.upsert({
      where: { clientProfileId_productId: { clientProfileId, productId } },
      update: { quantity: nextQuantity },
      create: { clientProfileId, productId, quantity: nextQuantity },
      include: CART_ITEM_WITH_PRODUCT_INCLUDE,
    });

    return item;
  }

  /** Sets the exact quantity — the "+ / -" stepper's result, not an increment. */
  async setQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItemWithProduct> {
    const clientProfileId = await this.clientProfileId(userId);
    await this.findLineOrThrow(clientProfileId, productId);

    return this.prisma.db.cartItem.update({
      where: { clientProfileId_productId: { clientProfileId, productId } },
      data: { quantity },
      include: CART_ITEM_WITH_PRODUCT_INCLUDE,
    });
  }

  /** Idempotent — removing an absent line is a no-op. */
  async removeItem(userId: string, productId: string): Promise<void> {
    const clientProfileId = await this.clientProfileId(userId);

    await this.prisma.db.cartItem.deleteMany({ where: { clientProfileId, productId } });
  }

  private async findLineOrThrow(clientProfileId: string, productId: string): Promise<void> {
    const line = await this.prisma.db.cartItem.findUnique({
      where: { clientProfileId_productId: { clientProfileId, productId } },
      select: { id: true },
    });

    if (line === null) {
      throw new CartItemNotFoundException();
    }
  }
}
