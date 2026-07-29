import { SetMetadata } from '@nestjs/common';

export const THROTTLE_IDENTIFIER_KEY = 'throttleIdentifier';

/**
 * The three non-IP keys `AUTHENTICATION.md` §9 requires. Anything left undecorated
 * stays IP-keyed, which is the guard's default and correct for registration and
 * password reset.
 */
export type ThrottleIdentifierStrategy = 'ip-email' | 'email' | 'refresh-user';

export const ThrottleIdentifier = (strategy: ThrottleIdentifierStrategy): MethodDecorator =>
  SetMetadata(THROTTLE_IDENTIFIER_KEY, strategy);
