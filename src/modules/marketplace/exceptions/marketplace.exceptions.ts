import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. Deleted, deactivated (invisible to a public caller) or never existed. */
export class ProductCategoryNotFoundException extends AppException {
  constructor() {
    super(
      ERROR_CODE.PRODUCT_CATEGORY_NOT_FOUND,
      'That product category does not exist.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * 409. Checked before the insert so a duplicate costs one indexed read rather than a
 * rolled-back insert — same precedent as `CategorySlugTakenException`.
 */
export class ProductCategorySlugTakenException extends AppException {
  constructor() {
    super(
      ERROR_CODE.PRODUCT_CATEGORY_SLUG_TAKEN,
      'That slug is already taken.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 404. Deleted, deactivated (invisible to a public/client caller) or never existed. */
export class ProductNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.PRODUCT_NOT_FOUND, 'That product does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 404. No cart line for that product — distinct from the product itself not existing. */
export class CartItemNotFoundException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CART_ITEM_NOT_FOUND,
      'That product is not in your cart.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/** 422. Checkout attempted with no cart lines. */
export class CartEmptyException extends AppException {
  constructor() {
    super(ERROR_CODE.CART_EMPTY, 'Your cart is empty.', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** 404. Owner-only (else 404, never 403 — AUTHORIZATION.md §1), or never existed. */
export class OrderNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.ORDER_NOT_FOUND, 'That order does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 409. An order may be cancelled once — money was never really moved, but the state is. */
export class OrderAlreadyCancelledException extends AppException {
  constructor() {
    super(
      ERROR_CODE.ORDER_ALREADY_CANCELLED,
      'This order has already been cancelled.',
      HttpStatus.CONFLICT,
    );
  }
}
