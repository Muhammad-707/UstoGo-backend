import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. */
export class MasterNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.MASTER_NOT_FOUND, 'That master does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 409. BR-15: approval requires at least one category and one active service. */
export class MasterNotReadyForApprovalException extends AppException {
  constructor(reason: string) {
    super(ERROR_CODE.MASTER_NOT_READY_FOR_APPROVAL, reason, HttpStatus.CONFLICT);
  }
}

/** 409. e.g. approving an already-approved master, or rejecting one that never applied. */
export class InvalidApprovalTransitionException extends AppException {
  constructor() {
    super(
      ERROR_CODE.INVALID_APPROVAL_TRANSITION,
      'That transition is not valid from the master’s current state.',
      HttpStatus.CONFLICT,
    );
  }
}
