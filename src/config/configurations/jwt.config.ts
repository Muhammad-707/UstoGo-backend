import type { Env } from '../env.schema';

export type JwtConfig = {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly accessTtl: string;
  readonly refreshTtl: string;
  readonly issuer: string;
  readonly audience: string;
  readonly bcryptRounds: number;
  readonly passwordResetTtl: string;
  readonly passwordResetUrl: string;
  readonly emailVerificationTtl: string;
  readonly emailVerificationUrl: string;
};

export const buildJwtConfig = (env: Env): JwtConfig =>
  Object.freeze({
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    bcryptRounds: env.BCRYPT_ROUNDS,
    passwordResetTtl: env.PASSWORD_RESET_TTL,
    passwordResetUrl: env.PASSWORD_RESET_URL,
    emailVerificationTtl: env.EMAIL_VERIFICATION_TTL,
    emailVerificationUrl: env.EMAIL_VERIFICATION_URL,
  });
