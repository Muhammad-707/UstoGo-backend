import { Module } from '@nestjs/common';

import { AdminOrdersController } from './controllers/admin-orders.controller';
import { AdminProductCategoriesController } from './controllers/admin-product-categories.controller';
import { AdminProductsController } from './controllers/admin-products.controller';
import { CartController } from './controllers/cart.controller';
import { OrdersController } from './controllers/orders.controller';
import { ProductCategoriesController } from './controllers/product-categories.controller';
import { ProductsController } from './controllers/products.controller';
import { WishlistController } from './controllers/wishlist.controller';
import { CartService } from './services/cart.service';
import { CheckoutService } from './services/checkout.service';
import { OrdersService } from './services/orders.service';
import { ProductCategoriesService } from './services/product-categories.service';
import { ProductLikesService } from './services/product-likes.service';
import { ProductsService } from './services/products.service';

/**
 * The construction-materials shop (client request, 2026-08-08) — a client-facing
 * marketplace distinct from the labour-booking core loop. `MODULES.md`-style
 * invariants: product mutations are ADMIN-only and audited; purchasing (cart,
 * wishlist, checkout) is CLIENT-only; checkout is a mocked payment, never a real one
 * (ADR-8 keeps booking payments off-platform entirely; this shop's "payment" is a
 * distinct, explicitly fake mechanism, not a reopening of that decision).
 */
@Module({
  controllers: [
    ProductCategoriesController,
    AdminProductCategoriesController,
    ProductsController,
    AdminProductsController,
    WishlistController,
    CartController,
    OrdersController,
    AdminOrdersController,
  ],
  providers: [
    ProductCategoriesService,
    ProductsService,
    ProductLikesService,
    CartService,
    CheckoutService,
    OrdersService,
  ],
  exports: [ProductCategoriesService, ProductsService],
})
export class MarketplaceModule {}
