import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

import { PrismaService } from '@prisma-lib/prisma.service';

import {
  THROTTLE_IDENTIFIER_KEY,
  type ThrottleIdentifierStrategy,
} from '../decorators/throttle-identifier.decorator';
import { hashToken } from '../domain/refresh-token.util';

/**
 * Replaces the default IP-only tracker with the identifiers `AUTHENTICATION.md` §9
 * documents: IP+email for login, email for forgot-password, the token's owner for
 * refresh. Anything without a `@ThrottleIdentifier()` — including every non-auth route
 * — keeps the base class's IP tracker, which is what registration and reset-password
 * are specified to use.
 */
@Injectable()
export class IdentifierThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    super(options, storage, reflector);
  }

  /**
   * `ThrottlerGuard.handleRequest` always calls this with both arguments (see
   * `getTracker(req, context)` there), but the base class's own declared signature
   * takes only `req` — `context` has to stay optional here to remain assignable to it,
   * even though it is never actually omitted at runtime.
   */
  protected override async getTracker(
    req: Record<string, unknown>,
    context?: ExecutionContext,
  ): Promise<string> {
    if (context === undefined) {
      return super.getTracker(req);
    }

    const strategy = this.reflector.getAllAndOverride<ThrottleIdentifierStrategy | undefined>(
      THROTTLE_IDENTIFIER_KEY,
      [context.getHandler(), context.getClass()],
    );

    switch (strategy) {
      case 'ip-email':
        return `${req.ip as string}:${this.emailOf(req)}`;
      case 'email':
        return this.emailOf(req) ?? (req.ip as string);
      case 'refresh-user':
        return (await this.userIdFromRefreshToken(req)) ?? (req.ip as string);
      default:
        return super.getTracker(req);
    }
  }

  /**
   * Read only, never validated — the validation pipe runs after every guard, so a
   * malformed or missing body is still a real request that must count against *some*
   * bucket. `undefined` here falls through to the IP fallback above.
   */
  private emailOf(req: Record<string, unknown>): string | undefined {
    const body = req.body as Record<string, unknown> | undefined;
    const email = body?.email;

    return typeof email === 'string' ? email.toLowerCase() : undefined;
  }

  /**
   * The refresh token is opaque by design (`refresh-token.util.ts`) — nothing about it
   * reveals the owner without the same indexed lookup `TokenService.rotate` performs a
   * moment later. Paying for it twice on the hot path is the cost of keying the limit
   * on the account rather than the individual token, which is what lets a family's
   * devices share one 30-per-hour budget instead of getting one each.
   */
  private async userIdFromRefreshToken(req: Record<string, unknown>): Promise<string | undefined> {
    const body = req.body as Record<string, unknown> | undefined;
    const raw = body?.refreshToken;

    if (typeof raw !== 'string' || raw.length === 0) {
      return undefined;
    }

    const record = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      select: { userId: true },
    });

    return record?.userId;
  }
}
