import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

import { CHAT } from '../constants/chat.constants';

/**
 * 404. Also returned when the caller is not a participant of a conversation that
 * does exist — AUTHORIZATION.md §1: a 403 would confirm the id is real to someone
 * who may not see it.
 */
export class ConversationNotFoundException extends AppException {
  constructor() {
    super(
      ERROR_CODE.CONVERSATION_NOT_FOUND,
      'That conversation does not exist.',
      HttpStatus.NOT_FOUND,
    );
  }
}

/** 403. FR-10: no non-expired booking links the two participants. Explicitly a 403
 *  in the registry — unlike most ownership checks, the caller supplied the other
 *  participant's id directly, so there is nothing left to hide by returning 404. */
export class NoSharedBookingException extends AppException {
  constructor() {
    super(
      ERROR_CODE.NO_SHARED_BOOKING,
      'A conversation requires a shared booking between the two participants.',
      HttpStatus.FORBIDDEN,
    );
  }
}

/** 422. FR-10: message body over 4000 characters. */
export class MessageTooLongException extends AppException {
  constructor() {
    super(
      ERROR_CODE.MESSAGE_TOO_LONG,
      `A message cannot exceed ${String(CHAT.MESSAGE_MAX_LENGTH)} characters.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
