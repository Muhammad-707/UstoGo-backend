import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { durationToSeconds } from '@common/utils/duration.util';
import { AppConfigService } from '@config/app-config.service';
import { ReferralsModule } from '@modules/referrals/referrals.module';

import { AuthController } from './controllers/auth.controller';
import { EmailVerificationController } from './controllers/email-verification.controller';
import { SessionsController } from './controllers/sessions.controller';
import { TwoFactorController } from './controllers/two-factor.controller';
import { AuthService } from './services/auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordResetService } from './services/password-reset.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { TwoFactorService } from './services/two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * F-01 (MODULES.md › AuthModule).
 *
 * `signOptions` are set once here rather than at each call site, so every access token
 * this service issues carries the same issuer, audience and lifetime — the three claims
 * `JwtStrategy` verifies on the way back in.
 */
@Module({
  imports: [
    ReferralsModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        privateKey: config.jwt.accessPrivateKey,
        publicKey: config.jwt.accessPublicKey,
        signOptions: {
          algorithm: 'RS256',
          // Seconds rather than the `15m` string: jsonwebtoken accepts both, but the
          // API also reports expiresIn as a number, and deriving both from one call
          // keeps the real lifetime and the advertised one from drifting.
          expiresIn: durationToSeconds(config.jwt.accessTtl),
          issuer: config.jwt.issuer,
          audience: config.jwt.audience,
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    EmailVerificationController,
    TwoFactorController,
    SessionsController,
  ],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    PasswordResetService,
    EmailVerificationService,
    TwoFactorService,
    JwtStrategy,
  ],
  // `JwtModule` and `JwtStrategy` are exported so `ChatGateway` can verify a socket
  // handshake's access token the exact same way `JwtAuthGuard`/`JwtStrategy` verify
  // one on a REST request — same secret, same issuer/audience checks, same re-read
  // of the account from the database — rather than duplicating that logic.
  exports: [AuthService, TokenService, JwtModule, JwtStrategy],
})
export class AuthModule {}
