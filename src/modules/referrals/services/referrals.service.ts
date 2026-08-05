import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ERROR_CODE } from '@common/constants/error-codes.constant';
import { ResourceNotFoundException } from '@common/exceptions/generic.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import type { MyReferralResponseDto } from '../dto/responses/my-referral.response.dto';

/** Postgres unique-violation code (same one `idempotency.service.ts` handles). */
const UNIQUE_VIOLATION = 'P2002';
const CODE_LENGTH = 8;
/** No 0/O/1/I — a code a person reads over the phone should not be ambiguous. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_GENERATION_ATTEMPTS = 5;

/**
 * §6.4 (MASTER_PROMPT.md) — referral codes and the reward ledger. `resolveReferrer`
 * is called from `AuthService.registerClient`; everything else backs `GET /me/referral`.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `?ref=CODE` at registration → the referring client's id, or `undefined` for a
   * missing/unknown code. Never throws: a typo'd or stale referral code is not a
   * reason to fail someone's registration (§6.4's own framing — "best-effort").
   */
  async resolveReferrer(code: string | undefined): Promise<string | undefined> {
    if (code === undefined) {
      return undefined;
    }
    const referrer = await this.prisma.db.clientProfile.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    return referrer?.id;
  }

  async getMyReferral(userId: string): Promise<MyReferralResponseDto> {
    const profile = await this.prisma.db.clientProfile.findUnique({
      where: { userId },
      select: { id: true, referralCode: true },
    });
    if (profile === null) {
      throw new ResourceNotFoundException(ERROR_CODE.USER_NOT_FOUND, 'Client profile not found.');
    }

    const code = profile.referralCode ?? (await this.ensureCode(profile.id));

    const [referredCount, rewards] = await Promise.all([
      this.prisma.db.clientProfile.count({ where: { referredByClientProfileId: profile.id } }),
      this.prisma.db.referralReward.aggregate({
        where: { referrerClientProfileId: profile.id },
        _sum: { bonusAmount: true },
        _count: true,
      }),
    ]);

    return {
      code,
      referredCount,
      rewardCount: rewards._count,
      totalBonus: rewards._sum.bonusAmount ?? 0,
    };
  }

  /** Lazily assigns a code on first read (backfill-free — see the schema comment). */
  private async ensureCode(clientProfileId: string): Promise<string> {
    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = this.generateCode();
      try {
        const updated = await this.prisma.db.clientProfile.update({
          where: { id: clientProfileId },
          data: { referralCode: code },
          select: { referralCode: true },
        });
        return updated.referralCode as string;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_VIOLATION
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Could not generate a unique referral code after several attempts.');
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }
}
