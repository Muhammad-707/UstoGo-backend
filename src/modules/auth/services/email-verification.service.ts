import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { User } from '@prisma/client';

import { durationToSeconds } from '@common/utils/duration.util';
import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';
import { MailService } from '@shared/mail/mail.service';

import { generateEmailVerificationToken, hashToken } from '../domain/refresh-token.util';
import { AUTH_EVENT, EmailVerifiedEvent } from '../events/auth.events';
import {
  EmailAlreadyVerifiedException,
  InvalidVerificationTokenException,
} from '../exceptions/auth.exceptions';

/**
 * Email verification (Phase 6 — ROADMAP.md).
 *
 * Same shape as `PasswordResetService`: only the SHA-256 hash of the token is stored,
 * the raw value travels once in the outbound email, and issuing a new token invalidates
 * any still-outstanding one. Not gated on anything else in v1 — no FR/SRS document ties
 * `emailVerifiedAt` to an access restriction, so this closes the data model DATABASE.md
 * §3.1 already reserved for it without inventing an enforcement rule nobody asked for.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionManager,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly events: EventEmitter2,
  ) {}

  /** Issues a fresh token and emails it. Called once, right after registration. */
  async issue(user: User): Promise<void> {
    await this.issueAndSend(user);
  }

  /**
   * Re-issues a verification link for the caller.
   *
   * @throws {EmailAlreadyVerifiedException} the address is already verified — resending
   *   would otherwise silently no-op, which is worse than telling the caller why.
   */
  async resend(userId: string): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.emailVerifiedAt !== null) {
      throw new EmailAlreadyVerifiedException();
    }

    await this.issueAndSend(user);
  }

  /**
   * Consumes the token and marks the address verified.
   *
   * @throws {InvalidVerificationTokenException} unknown, expired or already used — one
   *   code for all three, matching the reset-token precedent.
   */
  async verify(rawToken: string): Promise<void> {
    const record = await this.prisma.db.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (record === null || record.usedAt !== null || record.expiresAt <= new Date()) {
      throw new InvalidVerificationTokenException();
    }

    await this.tx.run(async (tx) => {
      // Conditional consume: two requests carrying the same link must not both succeed.
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (consumed.count === 0) {
        throw new InvalidVerificationTokenException();
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
    });

    this.events.emit(AUTH_EVENT.EMAIL_VERIFIED, new EmailVerifiedEvent(record.userId));
    this.logger.log(`Email verified for user ${record.userId}`);
  }

  private async issueAndSend(user: User): Promise<void> {
    const raw = generateEmailVerificationToken();
    const expiresAt = new Date(
      Date.now() + durationToSeconds(this.config.jwt.emailVerificationTtl) * 1000,
    );

    await this.tx.run(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.emailVerificationToken.create({
        data: { userId: user.id, tokenHash: hashToken(raw), expiresAt },
      });
    });

    const link = `${this.config.jwt.emailVerificationUrl}?token=${raw}`;

    this.mail.sendAndForget({
      to: user.email,
      subject: 'Verify your UstoGo email address',
      text: [
        'Welcome to UstoGo!',
        '',
        `Confirm your email address here: ${link}`,
        '',
        `The link expires in ${this.config.jwt.emailVerificationTtl}.`,
      ].join('\n'),
    });
  }
}
