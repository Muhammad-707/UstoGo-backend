/** DATABASE.md marketplace §: a cart line or order line quantity, DB-CHECK-enforced too. */
export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 99;

/** A product may carry at most this many gallery photos. */
export const MAX_PRODUCT_IMAGES = 10;

/** Same shape as `SLUG_PATTERN` (categories module) — lowercase, hyphen-separated. */
export const PRODUCT_CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
