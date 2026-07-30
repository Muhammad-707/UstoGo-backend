import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. Deleted or never existed — the admin routes are the only ones that read by id. */
export class BannerNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.BANNER_NOT_FOUND, 'That banner does not exist.', HttpStatus.NOT_FOUND);
  }
}
