import type { Env } from '../env.schema';

export type MailConfig = {
  readonly host: string;
  readonly port: number;
  readonly user: string | null;
  readonly password: string | null;
  readonly from: string;
};

export const buildMailConfig = (env: Env): MailConfig =>
  Object.freeze({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    // Mailpit accepts unauthenticated SMTP locally, so credentials are genuinely
    // optional rather than merely unset.
    user: env.MAIL_USER.length > 0 ? env.MAIL_USER : null,
    password: env.MAIL_PASSWORD.length > 0 ? env.MAIL_PASSWORD : null,
    from: env.MAIL_FROM,
  });
