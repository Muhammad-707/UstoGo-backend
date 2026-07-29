import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. Deleted, deactivated (invisible to a public caller) or never existed. */
export class CategoryNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.CATEGORY_NOT_FOUND, 'That category does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 422. BR-20: a tree of maximum depth 3. */
export class CategoryDepthExceededException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CATEGORY_DEPTH_EXCEEDED,
      'That would place a category deeper than the maximum of 3 levels.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 422. Self-parenting, or parenting under one of the category's own descendants. */
export class CategoryInvalidParentException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CATEGORY_INVALID_PARENT,
      'A category cannot be parented under itself or one of its own descendants.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 409. BR-22: a category with children cannot be hard-deleted; deactivate it instead. */
export class CategoryInUseException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CATEGORY_IN_USE,
      'This category has child categories and cannot be deleted. Deactivate it instead.',
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * 409. Checked before the insert so a duplicate costs one indexed read rather than a
 * rolled-back insert; the unique index is the real guarantee against the race
 * (`prisma-exception.mapper.ts` maps the same `slug` constraint to this code).
 */
export class CategorySlugTakenException extends AppException {
  constructor() {
    super(ERROR_CODE.CATEGORY_SLUG_TAKEN, 'That slug is already taken.', HttpStatus.CONFLICT);
  }
}
