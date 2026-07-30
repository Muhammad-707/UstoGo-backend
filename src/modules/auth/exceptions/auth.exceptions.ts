import { HttpStatus } from '@nestjs/common';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { AppException } from '@common/exceptions/app.exception';

/**
 * Named for the business condition, not the HTTP status (ERROR_HANDLING.md §2).
 *
 * Every message here is deliberately vague about *which* half of the credential was
 * wrong. That is the point of AUTHENTICATION.md §6: an attacker must not be able to
 * separate "no such account" from "wrong password".
 */

/** 401. Unknown email and wrong password produce this identical response. */
export class InvalidCredentialsException extends AppException {
  constructor() {
    super(ERROR_CODE.INVALID_CREDENTIALS, 'Invalid email or password.', HttpStatus.UNAUTHORIZED);
  }
}

/** 409. The email belongs to a live account. */
export class EmailAlreadyExistsException extends AppException {
  constructor() {
    super(
      ERROR_CODE.EMAIL_ALREADY_EXISTS,
      'That email address is already registered.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. */
export class PhoneAlreadyExistsException extends AppException {
  constructor() {
    super(
      ERROR_CODE.PHONE_ALREADY_EXISTS,
      'That phone number is already registered.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 403. Returned only after the password verifies, so it cannot enumerate accounts. */
export class AccountBlockedException extends AppException {
  constructor() {
    super(ERROR_CODE.ACCOUNT_BLOCKED, 'This account has been blocked.', HttpStatus.FORBIDDEN);
  }
}

/** 403. Likewise returned only after the password verifies. */
export class AccountInactiveException extends AppException {
  constructor() {
    super(ERROR_CODE.ACCOUNT_INACTIVE, 'This account is not active.', HttpStatus.FORBIDDEN);
  }
}

/** 401. Unknown, expired or revoked — one code, so none of them is distinguishable. */
export class InvalidRefreshTokenException extends AppException {
  constructor() {
    super(
      ERROR_CODE.INVALID_REFRESH_TOKEN,
      'The refresh token is invalid or has expired.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * 401. A token that was already consumed was presented again.
 *
 * Distinct from `INVALID_REFRESH_TOKEN` on purpose: the client must clear its
 * credentials and force a re-login rather than retry, and an operator seeing a spike of
 * these is looking at credential theft, not at expiry (AUTHENTICATION.md §3).
 */
export class RefreshTokenReusedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.REFRESH_TOKEN_REUSED,
      'This session was terminated because a refresh token was reused.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/** 400. Missing, expired or already used — again one code, one message. */
export class InvalidResetTokenException extends AppException {
  constructor() {
    super(
      ERROR_CODE.INVALID_RESET_TOKEN,
      'The reset link is invalid or has expired.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** 422. The new password equals the current one (AUTHENTICATION.md §7). */
export class PasswordReusedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.PASSWORD_REUSED,
      'The new password must differ from the current one.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** 400. Missing, expired or already used — one code, one message, as with reset tokens. */
export class InvalidVerificationTokenException extends AppException {
  constructor() {
    super(
      ERROR_CODE.INVALID_VERIFICATION_TOKEN,
      'The verification link is invalid or has expired.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** 409. Resending a verification link for an already-verified address. */
export class EmailAlreadyVerifiedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.EMAIL_ALREADY_VERIFIED,
      'This email address is already verified.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 401. A submitted TOTP code did not match the current or adjacent time step. */
export class InvalidTotpCodeException extends AppException {
  constructor() {
    super(
      ERROR_CODE.INVALID_TOTP_CODE,
      'The verification code is invalid.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/** 409. `enable` called for an account that already has TOTP turned on. */
export class TotpAlreadyEnabledException extends AppException {
  constructor() {
    super(
      ERROR_CODE.TOTP_ALREADY_ENABLED,
      'Two-factor authentication is already enabled.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. `disable` called for an account that does not have TOTP turned on. */
export class TotpNotEnabledException extends AppException {
  constructor() {
    super(
      ERROR_CODE.TOTP_NOT_ENABLED,
      'Two-factor authentication is not enabled.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 409. `enable` called before `setup` issued a pending secret. */
export class TotpSetupNotStartedException extends AppException {
  constructor() {
    super(
      ERROR_CODE.TOTP_SETUP_NOT_STARTED,
      'Start enrollment with /auth/2fa/setup first.',
      HttpStatus.CONFLICT,
    );
  }
}

/** 401. Unknown, expired or already used — one code for all three, as with every other token. */
export class InvalidTwoFactorChallengeException extends AppException {
  constructor() {
    super(
      ERROR_CODE.INVALID_TWO_FACTOR_CHALLENGE,
      'The two-factor challenge is invalid or has expired.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * 404. No live session in this family belongs to the caller.
 *
 * Returned for an unknown id and for another account's session alike — the
 * ownership → 404 convention (`CLAUDE.md` §5) — so a foreign session id cannot be
 * distinguished from one that never existed.
 */
export class SessionNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.SESSION_NOT_FOUND, 'That session does not exist.', HttpStatus.NOT_FOUND);
  }
}

/** 404. A referenced city does not exist. */
export class CityNotFoundException extends AppException {
  constructor() {
    super(ERROR_CODE.CITY_NOT_FOUND, 'That city does not exist.', HttpStatus.NOT_FOUND);
  }
}
