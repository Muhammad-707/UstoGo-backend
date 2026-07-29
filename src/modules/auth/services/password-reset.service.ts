import { Injectable, Logger } from '@nestjs/common';

import { durationToSeconds } from '@common/utils/duration.util';
import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';
import { MailService } from '@shared/mail/mail.service';

import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { REVOKED_REASON } from '../constants/auth.constants';
import { generateResetToken, hashToken } from '../domain/refresh-token.util';
import { InvalidResetTokenException } from '../exceptions/auth.exceptions';

/**
 * Password reset (AUTHENTICATION.md §8).
 *
 * Only the SHA-256 hash of a reset token is stored; the raw value exists in the
 * outbound email and nowhere else, so a database dump yields no usable reset links.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionManager,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Always succeeds from the caller's point of view — the controller answers 202
   * whether or not the address is registered. An endpoint that answered differently
   * for a known address would be a free account-enumeration oracle, which is the same
   * reason login has a dummy comparison.
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.prisma.db.user.findFirst({ where: { email } });

    if (user === null) {
      return;
    }

    const raw = generateResetToken();
    const expiresAt = new Date(
      Date.now() + durationToSeconds(this.config.jwt.passwordResetTtl) * 1000,
    );

    await this.tx.run(async (tx) => {
      // One active token per user: issuing a new link invalidates the previous one, so
      // a forwarded or intercepted older email stops working the moment a fresh
      // request is made.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(raw), expiresAt },
      });
    });

    const link = `${this.config.jwt.passwordResetUrl}?token=${raw}`;

    this.mail.sendAndForget({
      to: user.email,
      subject: 'Reset your UstoGo password',
      text: [
        'We received a request to reset your UstoGo password.',
        '',
        `Open this link to choose a new one: ${link}`,
        '',
        `The link expires in ${this.config.jwt.passwordResetTtl} and can be used once.`,
        'If you did not request this, no action is needed — your password has not changed.',
      ].join('\n'),
    });
  }

  /**
   * Consumes the token and sets the new password.
   *
   * Every session is revoked, including the caller's. A reset is what someone does when
   * they believe their account is compromised, so leaving any existing session alive
   * would defeat the point (AUTHENTICATION.md §4).
   *
   * @throws {InvalidResetTokenException} when the token is unknown, expired or used —
   *   one code for all three, so none of them is distinguishable.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.prisma.db.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (record === null || record.usedAt !== null || record.expiresAt <= new Date()) {
      throw new InvalidResetTokenException();
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await this.tx.run(async (tx) => {
      // Conditional consume, as with refresh rotation: two requests carrying the same
      // link must not both succeed.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (consumed.count === 0) {
        throw new InvalidResetTokenException();
      }

      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await this.tokens.revokeAllForUser(record.userId, REVOKED_REASON.PASSWORD_RESET, tx);
    });

    const user = await this.prisma.db.user.findUnique({ where: { id: record.userId } });

    if (user !== null) {
      this.mail.sendAndForget({
        to: user.email,
        subject: 'Your UstoGo password was changed',
        text: [
          'Your UstoGo password has just been changed and all your sessions were signed out.',
          '',
          'If this was not you, reset your password immediately and contact support.',
        ].join('\n'),
      });
    }

    this.logger.log(`Password reset completed for user ${record.userId}`);
  }
}
