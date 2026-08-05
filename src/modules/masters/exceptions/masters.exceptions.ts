import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

import { PORTFOLIO_IMAGE_LIMIT } from '../constants/masters.constants';

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

/** 404. */
export class PortfolioImageNotFoundException extends AppException {
  constructor() {
    super(
      ERROR_CODE.PORTFOLIO_IMAGE_NOT_FOUND,
      'That portfolio image does not exist.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/** 422. B-45: a bounded highlight reel, not an unlimited gallery. */
export class PortfolioLimitExceededException extends AppException {
  constructor() {
    super(
      ERROR_CODE.PORTFOLIO_LIMIT_EXCEEDED,
      `A master may have at most ${String(PORTFOLIO_IMAGE_LIMIT)} portfolio images.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 404. §6.17: certificate moderation. */
export class CertificateNotFoundException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CERTIFICATE_NOT_FOUND,
      'That certificate does not exist.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/** 409. Verifying an already-verified certificate is not idempotent — a second admin
 *  finding it already handled should see that explicitly, not silently re-stamp it. */
export class CertificateAlreadyVerifiedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CERTIFICATE_ALREADY_VERIFIED,
      'That certificate has already been verified.',
      HttpStatus.CONFLICT,
    );
  }
}
