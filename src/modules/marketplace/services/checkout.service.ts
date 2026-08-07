import { Injectable } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import { ORDER_WITH_ITEMS_INCLUDE } from './order-includes';
import type { OrderWithItems } from '../dto/responses/order.response.dto';
import { CartEmptyException } from '../exceptions/marketplace.exceptions';

/**
 * Checks out the client's cart into an `Order`. Deliberately mocked: no card data is
 * ever collected, `status` is `PAID` the instant the order is created — a fake/mock
 * payment, distinct from ADR-8's real decision to keep booking payments off-platform
 * entirely. A cart line whose product has since been deactivated is silently excluded
 * from the order and left in the cart, rather than blocking checkout of the rest.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
    private readonly config: AppConfigService,
  ) {}

  async checkout(userId: string): Promise<OrderWithItems> {
    const clientProfile = await this.prisma.db.clientProfile.findUnique({ where: { userId } });
    if (clientProfile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    const cartItems = await this.prisma.db.cartItem.findMany({
      where: { clientProfileId: clientProfile.id, product: { isActive: true } },
      include: { product: { select: { id: true, name: true, price: true } } },
    });

    if (cartItems.length === 0) {
      throw new CartEmptyException();
    }

    const totalAmount = cartItems.reduce(
      (sum, item) => sum + item.product.price.toNumber() * item.quantity,
      0,
    );
    const currency = this.config.catalogue.currency;
    const checkedOutProductIds = cartItems.map((item) => item.productId);

    return this.transactionManager.run(async (tx) => {
      const order = await tx.order.create({
        data: {
          clientProfileId: clientProfile.id,
          totalAmount,
          currency,
          items: {
            create: cartItems.map((item) => ({
              productId: item.productId,
              productName: item.product.name,
              unitPrice: item.product.price,
              quantity: item.quantity,
            })),
          },
        },
        include: ORDER_WITH_ITEMS_INCLUDE,
      });

      await tx.cartItem.deleteMany({
        where: { clientProfileId: clientProfile.id, productId: { in: checkedOutProductIds } },
      });

      return order;
    });
  }
}
