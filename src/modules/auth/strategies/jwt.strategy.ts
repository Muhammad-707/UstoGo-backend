import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import type { JwtPayload } from '@common/types/jwt-payload.type';
import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';

import { AUTH } from '../constants/auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessPublicKey,
      // RS256 only — without this, jsonwebtoken's "none"/algorithm-confusion class of
      // bug becomes reachable: a token whose header claims HS256 would otherwise be
      // verified by HMAC-ing the *public* key as if it were a shared secret, which an
      // attacker can compute themselves since the public key is, by design, public.
      algorithms: ['RS256'],
      // Verified, not merely present (AUTHENTICATION.md §2). Without these, a token
      // minted by any other service holding a trusted key would be accepted here.
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      // passport-jwt forwards these straight to jsonwebtoken; clock tolerance is not a
      // strategy-level option.
      jsonWebTokenOptions: { clockTolerance: AUTH.CLOCK_SKEW_SECONDS },
    });
  }

  /**
   * Re-reads the account on every request (AUTHENTICATION.md §2).
   *
   * The token's `role` and `status` claims are a fast path, not evidence: both can
   * change during a token's 15-minute life. One indexed primary-key lookup collapses
   * the revocation window to zero, so a blocked user loses access immediately rather
   * than whenever their token happens to expire.
   *
   * The soft-delete extension applies here, so a deleted account simply does not
   * resolve — there is no `deletedAt` check to forget.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true },
    });

    if (user === null || user.status !== UserStatus.ACTIVE) {
      // Deliberately generic: the caller learns their token no longer works, not
      // whether the account was deleted, blocked or merely deactivated.
      throw new UnauthorizedException();
    }

    return { id: user.id, email: user.email, role: user.role, sessionId: payload.sid };
  }
}
