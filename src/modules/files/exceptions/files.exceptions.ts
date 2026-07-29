import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/** 404. Unknown, deleted, or belonging to another uploader (AUTHORIZATION.md §1). */
export class FileNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.FILE_NOT_FOUND, 'That file does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 422. The declared type is not permitted for this purpose. */
export class UnsupportedMimeTypeException extends AppException {
  constructor(mimeType: string, allowed: readonly string[]) {
    super(
      ERROR_CODE.UNSUPPORTED_MIME_TYPE,
      `${mimeType} is not accepted here. Allowed: ${allowed.join(', ')}.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 422. */
export class FileTooLargeException extends AppException {
  constructor(maxBytes: number) {
    super(
      ERROR_CODE.FILE_TOO_LARGE,
      `That file exceeds the ${String(Math.round(maxBytes / 1024 / 1024))} MB limit.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * 422. The stored object could not be verified — it is missing, or its real content
 * type or size disagrees with what was declared at presign time.
 *
 * One code for all three: the declared type and the extension are both attacker-
 * controlled, and distinguishing "you lied about the type" from "you lied about the
 * size" tells a prober how the check works without helping an honest client.
 */
export class InvalidFileException extends AppException {
  constructor(reason = 'The uploaded file could not be verified.') {
    super(ERROR_CODE.INVALID_FILE, reason, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** 409. The file exists but has not passed server-side verification yet. */
export class FileNotConfirmedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.FILE_NOT_CONFIRMED,
      'That file has not been confirmed yet.',
      HttpStatus.CONFLICT,
    );
  }
}
