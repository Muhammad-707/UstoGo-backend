import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';

import type { JwtClaims } from '@common/types/jwt-payload.type';
import { durationToSeconds } from '@common/utils/duration.util';
import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager, type PrismaTransaction } from '@prisma-lib/transaction.manager';

import { REVOKED_REASON, type RevokedReason } from '../constants/auth.constants';
import { generateRefreshToken, hashToken } from '../domain/refresh-token.util';
import {
  InvalidRefreshTokenException,
  RefreshTokenReusedException,
  SessionNotFoundException,
} from '../exceptions/auth.exceptions';

export type SessionContext = {
  readonly deviceId?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly ipAddress?: string | undefined;
};

export type TokenPair = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
};

/** One row per refresh-token family — what the caller thinks of as "a device". */
export type SessionSummary = {
  readonly id: string; // familyId
  readonly deviceId: string | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date; // first token issued in the family — session start
  readonly lastActiveAt: Date; // most recent token issued in the family — last refresh
  readonly current: boolean;
};

/**
 * Issues, rotates and revokes sessions (AUTHENTICATION.md §3, §4).
 *
 * Uses Prisma directly rather than through a repository: the queries here are owned by
 * this one service and nothing else reads `refresh_tokens`, which is the case
 * ARCHITECTURE.md §7 says a repository does not earn.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionManager,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /** A new family. Used at login and registration — never at refresh. */
  async issuePair(user: User, context: SessionContext = {}): Promise<TokenPair> {
    const familyId = randomUUID();
    const refreshToken = await this.persistRefreshToken(user.id, familyId, context);

    return this.pairFor(user, familyId, refreshToken);
  }

  /**
   * Consumes the presented token and issues its successor in the same family.
   *
   * @throws {RefreshTokenReusedException} when a token already consumed is presented
   *   again — the whole family is revoked first (AUTHENTICATION.md §3).
   * @throws {InvalidRefreshTokenException} when the token is unknown, expired, revoked,
   *   or lost a race against a concurrent refresh of the same token.
   */
  async rotate(
    rawToken: string,
    context: SessionContext = {},
  ): Promise<{ user: User; tokens: TokenPair }> {
    const tokenHash = hashToken(rawToken);

    const existing = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (existing === null) {
      throw new InvalidRefreshTokenException();
    }

    // Reuse is checked *before* revocation, and the order is load-bearing: rotation
    // marks the consumed row both used and revoked, so a revoked-first check would
    // classify every replayed token as merely invalid and the family would never be
    // revoked — reuse detection would be dead code. Found by replaying a token against
    // a running server.
    //
    // Already consumed and committed: this is the theft signal the whole rotation
    // scheme exists to produce. Whoever holds the older copy is not the party that
    // refreshed last, so both are logged out.
    if (existing.usedAt !== null) {
      await this.revokeFamily(existing.familyId, REVOKED_REASON.REUSE_DETECTED);
      this.logger.warn(
        `Refresh token reuse detected; revoked family ${existing.familyId} for user ${existing.userId}`,
      );
      throw new RefreshTokenReusedException();
    }

    // Never used, but revoked by logout, a password change or an admin action; or
    // simply expired. One code for all of them, so none is distinguishable.
    if (existing.revokedAt !== null || existing.expiresAt <= new Date()) {
      throw new InvalidRefreshTokenException();
    }

    return this.tx.run(async (tx) => {
      // Conditional consume: the WHERE clause is what makes two concurrent refreshes of
      // the same token produce exactly one successor.
      const consumed = await tx.refreshToken.updateMany({
        where: { id: existing.id, usedAt: null, revokedAt: null },
        data: {
          usedAt: new Date(),
          revokedAt: new Date(),
          revokedReason: REVOKED_REASON.ROTATION,
        },
      });

      // Lost the race. Deliberately *not* treated as reuse: revoking the family here
      // would also revoke the successor the winner just received, leaving zero working
      // sessions where the contract calls for exactly one. Sequential reuse — the case
      // that actually indicates theft — is caught by the branch above.
      if (consumed.count === 0) {
        throw new InvalidRefreshTokenException();
      }

      const refreshToken = await this.persistRefreshToken(
        existing.userId,
        existing.familyId,
        context,
        tx,
      );

      return {
        user: existing.user,
        tokens: await this.pairFor(existing.user, existing.familyId, refreshToken),
      };
    });
  }

  /** Logout. Idempotent: an unknown or already-revoked token is not an error. */
  async revokeByRawToken(rawToken: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: REVOKED_REASON.LOGOUT },
    });
  }

  /** Logout-all, password reset, admin block, account deactivation. Idempotent. */
  async revokeAllForUser(
    userId: string,
    reason: RevokedReason,
    tx?: PrismaTransaction,
  ): Promise<void> {
    await (tx ?? this.prisma.db).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Password change: every other session dies, the caller's survives
   * (AUTHENTICATION.md §4). Scoped by family rather than by token, because the caller's
   * current token rotates and the family is what identifies "this device".
   */
  async revokeAllExceptFamily(
    userId: string,
    familyId: string,
    reason: RevokedReason,
    tx?: PrismaTransaction,
  ): Promise<void> {
    await (tx ?? this.prisma.db).refreshToken.updateMany({
      where: { userId, familyId: { not: familyId }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Every active session (device), most recently active first.
   *
   * A "session" here is a refresh-token family, not a single row — rotation replaces
   * the row on every refresh, but the family id is stable for the device's whole
   * lifetime. Rows are fetched oldest-first and folded in application code rather than
   * queried with `distinct`, so both the family's start (`createdAt`) and its last
   * activity (`lastActiveAt`) come out of one query; the row count per user is bounded
   * by how many devices someone is logged into, never large enough to warrant more.
   */
  async listSessions(userId: string, currentFamilyId: string): Promise<SessionSummary[]> {
    const rows = await this.prisma.db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      select: { familyId: true, deviceId: true, userAgent: true, ipAddress: true, createdAt: true },
    });

    const byFamily = new Map<string, SessionSummary>();
    for (const row of rows) {
      const existing = byFamily.get(row.familyId);
      byFamily.set(row.familyId, {
        id: row.familyId,
        deviceId: row.deviceId,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        createdAt: existing?.createdAt ?? row.createdAt,
        lastActiveAt: row.createdAt,
        current: row.familyId === currentFamilyId,
      });
    }

    return [...byFamily.values()].sort(
      (a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime(),
    );
  }

  /**
   * Revokes one session (family) on the caller's own account.
   *
   * @throws {SessionNotFoundException} no live row in this family belongs to `userId` —
   *   the ownership → 404 convention (`CLAUDE.md` §5), so a foreign family id cannot be
   *   distinguished from one that never existed.
   */
  async revokeSession(userId: string, familyId: string): Promise<void> {
    const owned = await this.prisma.db.refreshToken.findFirst({
      where: { userId, familyId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });

    if (owned === null) {
      throw new SessionNotFoundException();
    }

    await this.revokeFamily(familyId, REVOKED_REASON.SESSION_REVOKED);
  }

  private async revokeFamily(familyId: string, reason: RevokedReason): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async persistRefreshToken(
    userId: string,
    familyId: string,
    context: SessionContext,
    tx?: PrismaTransaction,
  ): Promise<string> {
    const raw = generateRefreshToken();
    const expiresAt = new Date(Date.now() + durationToSeconds(this.config.jwt.refreshTtl) * 1000);

    await (tx ?? this.prisma.db).refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(raw),
        expiresAt,
        ...(context.deviceId !== undefined ? { deviceId: context.deviceId } : {}),
        ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
        ...(context.ipAddress !== undefined ? { ipAddress: context.ipAddress } : {}),
      },
    });

    return raw;
  }

  private async pairFor(user: User, familyId: string, refreshToken: string): Promise<TokenPair> {
    const claims: JwtClaims = {
      sub: user.id,
      role: user.role,
      status: user.status,
      sid: familyId,
    };

    return {
      accessToken: await this.jwt.signAsync(claims),
      refreshToken,
      expiresIn: durationToSeconds(this.config.jwt.accessTtl),
    };
  }
}
