import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { durationToSeconds } from '@common/utils/duration.util';
import { AppConfigService } from '@config/app-config.service';

import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { PasswordResetService } from './services/password-reset.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
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
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwt.accessSecret,
        signOptions: {
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
  controllers: [AuthController],
  providers: [AuthService, TokenService, PasswordService, PasswordResetService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
