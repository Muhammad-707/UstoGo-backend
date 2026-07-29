import { Inject, Injectable, Logger } from '@nestjs/common';

import { MAIL_PROVIDER, type MailMessage, type MailProvider } from './mail.provider';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Transactional email with bounded retry (MODULES.md › MailModule).
 *
 * `sendAndForget` is the method callers use. Delivery must never decide the outcome of
 * the request that triggered it: `/auth/forgot-password` answers 202 whether or not the
 * address exists, so making it wait on — or fail with — an SMTP relay would both slow
 * it down and turn relay behaviour into an account-enumeration signal.
 *
 * Retries are in-process. A durable queue that survives a restart needs a broker and is
 * deferred (B-76); until then a failure after three attempts is logged as an error,
 * which is what the alerting in DEPLOYMENT.md §8 watches.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(MAIL_PROVIDER) private readonly provider: MailProvider) {}

  /** Awaits delivery. Use only where the caller genuinely must know it succeeded. */
  async send(message: MailMessage): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.provider.send(message);
        return;
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          throw error;
        }
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  /**
   * Delivers in the background. The recipient address is never logged — it is the
   * personal data the message is about (SECURITY.md).
   */
  sendAndForget(message: MailMessage): void {
    void this.send(message).catch(() => {
      this.logger.error(
        `Failed to deliver "${message.subject}" after ${String(MAX_ATTEMPTS)} attempts`,
      );
    });
  }
}
