import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. */
export class ServiceNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.SERVICE_NOT_FOUND, 'That service does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 422. FR-5.3: categoryId must be one of the master's attached leaf categories. */
export class ServiceCategoryNotAttachedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.SERVICE_CATEGORY_NOT_ATTACHED,
      'That category is not attached to your profile.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
