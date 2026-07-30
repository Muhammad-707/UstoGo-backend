import { Injectable, Logger } from '@nestjs/common';
import type { User } from '@prisma/client';

import { durationToSeconds } from '@common/utils/duration.util';
import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager } from '@prisma-lib/transaction.manager';

import type { SessionContext, TokenPair } from './token.service';
import { TokenService } from './token.service';
import { generateTwoFactorChallengeToken, hashToken } from '../domain/refresh-token.util';
import { decryptSecret, encryptSecret } from '../domain/secret-encryption.util';
import { generateTotpSecret, totpUri, verifyTotp } from '../domain/totp.util';
import {
  InvalidTotpCodeException,
  InvalidTwoFactorChallengeException,
  TotpAlreadyEnabledException,
  TotpNotEnabledException,
  TotpSetupNotStartedException,
} from '../exceptions/auth.exceptions';

export type TwoFactorSetup = {
  readonly secret: string;
  readonly otpauthUrl: string;
};

/**
 * TOTP two-factor for admin accounts (Phase 6 — ROADMAP.md). RFC 6238, implemented in
 * `domain/totp.util.ts` against `node:crypto` rather than a dependency.
 *
 * The secret is stored AES-256-GCM-encrypted (`domain/secret-encryption.util.ts`), not
 * hashed like every other token in this module — a TOTP code has to be verified by
 * recomputing HOTP from the secret, which requires the plaintext back, unlike a
 * password or a refresh token.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionManager,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Starts (or restarts) enrollment. The secret is stored immediately but
   * `totpEnabledAt` stays null until `enable` proves the caller's app has it —
   * otherwise a typo during setup could lock the account out with no working code.
   *
   * @throws {TotpAlreadyEnabledException} 2FA is already turned on; `disable` first.
   */
  async setup(userId: string): Promise<TwoFactorSetup> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.totpEnabledAt !== null) {
      throw new TotpAlreadyEnabledException();
    }

    const secret = generateTotpSecret();

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { totpSecret: encryptSecret(secret, this.config.jwt.totpEncryptionKey) },
    });

    return { secret, otpauthUrl: totpUri(secret, user.email, this.config.jwt.totpIssuer) };
  }

  /**
   * Confirms enrollment: the code must verify against the secret `setup` just issued.
   *
   * @throws {TotpAlreadyEnabledException} already enabled.
   * @throws {TotpSetupNotStartedException} `setup` was never called.
   * @throws {InvalidTotpCodeException} the code does not match.
   */
  async enable(userId: string, code: string): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.totpEnabledAt !== null) {
      throw new TotpAlreadyEnabledException();
    }
    if (user.totpSecret === null) {
      throw new TotpSetupNotStartedException();
    }
    if (!verifyTotp(decryptSecret(user.totpSecret, this.config.jwt.totpEncryptionKey), code)) {
      throw new InvalidTotpCodeException();
    }

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date() },
    });
    this.logger.log(`TOTP enabled for user ${userId}`);
  }

  /**
   * Turns 2FA off. Requires a valid code rather than just the session's bearer token,
   * so a stolen access token alone cannot downgrade the account's protection.
   *
   * @throws {TotpNotEnabledException} 2FA is not on.
   * @throws {InvalidTotpCodeException} the code does not match.
   */
  async disable(userId: string, code: string): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.totpEnabledAt === null || user.totpSecret === null) {
      throw new TotpNotEnabledException();
    }
    if (!verifyTotp(decryptSecret(user.totpSecret, this.config.jwt.totpEncryptionKey), code)) {
      throw new InvalidTotpCodeException();
    }

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null },
    });
    this.logger.log(`TOTP disabled for user ${userId}`);
  }

  /** Issued once a password verifies for an account with 2FA on (`AuthService.login`). */
  async issueChallenge(userId: string): Promise<string> {
    const raw = generateTwoFactorChallengeToken();
    const expiresAt = new Date(
      Date.now() + durationToSeconds(this.config.jwt.twoFactorChallengeTtl) * 1000,
    );

    await this.tx.run(async (tx) => {
      await tx.twoFactorChallenge.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.twoFactorChallenge.create({
        data: { userId, tokenHash: hashToken(raw), expiresAt },
      });
    });

    return raw;
  }

  /**
   * Consumes the challenge and, if the code verifies, issues a real session.
   *
   * @throws {InvalidTwoFactorChallengeException} unknown, expired or already used.
   * @throws {InvalidTotpCodeException} the challenge is valid but the code is not.
   */
  async verifyChallenge(
    rawChallenge: string,
    code: string,
    context: SessionContext,
  ): Promise<{ user: User; tokens: TokenPair }> {
    const record = await this.prisma.db.twoFactorChallenge.findUnique({
      where: { tokenHash: hashToken(rawChallenge) },
      include: { user: true },
    });

    if (record === null || record.usedAt !== null || record.expiresAt <= new Date()) {
      throw new InvalidTwoFactorChallengeException();
    }

    if (
      record.user.totpSecret === null ||
      !verifyTotp(decryptSecret(record.user.totpSecret, this.config.jwt.totpEncryptionKey), code)
    ) {
      throw new InvalidTotpCodeException();
    }

    const consumed = await this.prisma.db.twoFactorChallenge.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (consumed.count === 0) {
      throw new InvalidTwoFactorChallengeException();
    }

    const tokens = await this.tokens.issuePair(record.user, context);
    await this.prisma.db.user.update({
      where: { id: record.user.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: record.user, tokens };
  }
}
