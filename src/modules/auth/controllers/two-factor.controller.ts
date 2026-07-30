import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AppRequest } from '@common/types/app-request.type';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { sessionContext } from './session-context.util';
import { THROTTLE } from '../constants/throttle.constants';
import { TwoFactorCodeDto, TwoFactorVerifyDto } from '../dto/requests/two-factor.dto';
import { AuthResponseDto } from '../dto/responses/auth.response.dto';
import { TwoFactorSetupResponseDto } from '../dto/responses/two-factor.response.dto';
import { TwoFactorService } from '../services/two-factor.service';

const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };
const RATE_LIMITED = { description: 'TOO_MANY_REQUESTS', type: ErrorResponseDto };

/** TOTP two-factor for admin accounts (Phase 6). `POST /auth/login` starts the flow. */
@ApiTags('Auth')
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Post('verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE.TWO_FACTOR_VERIFY })
  @ApiOperation({
    summary: 'Exchange a login challenge and TOTP code for a token pair',
    description: 'Public — the challenge token and the code together are the credential.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'INVALID_TWO_FACTOR_CHALLENGE | INVALID_TOTP_CODE',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async verify(
    @Body() dto: TwoFactorVerifyDto,
    @Req() request: AppRequest,
  ): Promise<AuthResponseDto> {
    const { user, tokens } = await this.twoFactor.verifyChallenge(
      dto.challengeToken,
      dto.code,
      sessionContext(request),
    );
    return AuthResponseDto.from(user, tokens);
  }

  @Post('setup')
  @ApiAuth(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE.TWO_FACTOR_ENROLL })
  @ApiOperation({
    summary: 'Start TOTP enrollment',
    description:
      'ADMIN-only. Stores the new secret but does not enable it — confirm with the code ' +
      'the authenticator app produces via POST /auth/2fa/enable. Calling this again before ' +
      'confirming replaces the pending secret.',
  })
  @ApiOkResponse({ type: TwoFactorSetupResponseDto })
  @ApiConflictResponse({ description: 'TOTP_ALREADY_ENABLED', type: ErrorResponseDto })
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async setup(@CurrentUser() user: AuthenticatedUser): Promise<TwoFactorSetupResponseDto> {
    return this.twoFactor.setup(user.id);
  }

  @Post('enable')
  @ApiAuth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: THROTTLE.TWO_FACTOR_ENROLL })
  @ApiOperation({
    summary: 'Confirm TOTP enrollment',
    description:
      'ADMIN-only. Requires the code produced from the secret POST /auth/2fa/setup issued.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'TOTP_ALREADY_ENABLED | TOTP_SETUP_NOT_STARTED',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'INVALID_TOTP_CODE', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async enable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<void> {
    await this.twoFactor.enable(user.id, dto.code);
  }

  @Post('disable')
  @ApiAuth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: THROTTLE.TWO_FACTOR_ENROLL })
  @ApiOperation({
    summary: 'Turn TOTP off',
    description:
      'ADMIN-only. Requires a currently valid code — a stolen access token alone cannot ' +
      'downgrade the account out of 2FA.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'TOTP_NOT_ENABLED', type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_TOTP_CODE', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<void> {
    await this.twoFactor.disable(user.id, dto.code);
  }
}
