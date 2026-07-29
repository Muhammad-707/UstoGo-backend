import { Body, Controller, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AppRequest } from '@common/types/app-request.type';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { THROTTLE } from '../constants/throttle.constants';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResetPasswordDto,
} from '../dto/requests/credentials.dto';
import { RegisterClientDto } from '../dto/requests/register-client.dto';
import { RegisterMasterDto } from '../dto/requests/register-master.dto';
import { AuthResponseDto } from '../dto/responses/auth.response.dto';
import { AuthService } from '../services/auth.service';
import { PasswordResetService } from '../services/password-reset.service';
import { TokenService, type SessionContext } from '../services/token.service';

const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };
const RATE_LIMITED = { description: 'TOO_MANY_REQUESTS', type: ErrorResponseDto };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('register/client')
  @Public()
  @Throttle({ default: THROTTLE.REGISTER })
  @ApiOperation({
    summary: 'Register a client',
    description:
      'Public — no authentication required. Creates an ACTIVE client account and returns a ' +
      'token pair. The role is a server-side constant: a `role` property in the body is ' +
      'rejected by the validation whitelist, and no code path creates an administrator.',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({
    description: 'EMAIL_ALREADY_EXISTS | PHONE_ALREADY_EXISTS',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async registerClient(
    @Body() dto: RegisterClientDto,
    @Req() request: AppRequest,
  ): Promise<AuthResponseDto> {
    const { user, tokens } = await this.auth.registerClient(dto, sessionContext(request));
    return AuthResponseDto.from(user, tokens);
  }

  @Post('register/master')
  @Public()
  @Throttle({ default: THROTTLE.REGISTER })
  @ApiOperation({
    summary: 'Register a master',
    description:
      'Public — no authentication required. Creates the account and a MasterProfile with ' +
      'approvalStatus PENDING and isActive false. The master is invisible in search until ' +
      'an administrator approves them. Phone, city, display name and timezone are required.',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({
    description: 'EMAIL_ALREADY_EXISTS | PHONE_ALREADY_EXISTS',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async registerMaster(
    @Body() dto: RegisterMasterDto,
    @Req() request: AppRequest,
  ): Promise<AuthResponseDto> {
    const { user, tokens } = await this.auth.registerMaster(dto, sessionContext(request));
    return AuthResponseDto.from(user, tokens);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE.LOGIN })
  @ApiOperation({
    summary: 'Log in',
    description:
      'Public — no authentication required. An unknown email and a wrong password produce ' +
      'the same 401 and a comparable response time, so this endpoint cannot be used to ' +
      'discover which addresses are registered. Account status is reported only after the ' +
      'password verifies, for the same reason.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS', type: ErrorResponseDto })
  @ApiForbiddenResponse({
    description: 'ACCOUNT_BLOCKED | ACCOUNT_INACTIVE',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async login(@Body() dto: LoginDto, @Req() request: AppRequest): Promise<AuthResponseDto> {
    const context = { ...sessionContext(request), deviceId: dto.deviceId };
    const { user, tokens } = await this.auth.login(dto.email, dto.password, context);
    return AuthResponseDto.from(user, tokens);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE.REFRESH })
  @ApiOperation({
    summary: 'Rotate the token pair',
    description:
      'Public — the refresh token itself is the credential. Each refresh consumes the ' +
      'presented token and issues its successor in the same family. **Serialise your ' +
      'refreshes**: concurrent calls with the same token leave exactly one winner, and ' +
      'presenting an already-consumed token revokes every session in the family and ' +
      'returns REFRESH_TOKEN_REUSED. On that error, clear all credentials and re-login — ' +
      'do not retry.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'INVALID_REFRESH_TOKEN | REFRESH_TOKEN_REUSED',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: AppRequest,
  ): Promise<AuthResponseDto> {
    const { user, tokens } = await this.tokens.rotate(dto.refreshToken, sessionContext(request));
    return AuthResponseDto.from(user, tokens);
  }

  @Post('logout')
  @ApiAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke the presented refresh token',
    description: 'Idempotent — an unknown or already-revoked token still returns 204.',
  })
  @ApiNoContentResponse()
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.tokens.revokeByRawToken(dto.refreshToken);
  }

  @Post('logout-all')
  @ApiAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke every session of the caller',
    description: 'Idempotent. Signs the caller out of every device, including this one.',
  })
  @ApiNoContentResponse()
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.tokens.revokeAllForUser(user.id, 'LOGOUT');
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: THROTTLE.FORGOT_PASSWORD })
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Public — no authentication required. **Always** returns 202, whether or not the ' +
      'address is registered; answering differently would reveal which addresses have ' +
      'accounts. Any previously issued reset link stops working.',
  })
  @ApiAcceptedResponse()
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.passwordReset.requestReset(dto.email);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: THROTTLE.RESET_PASSWORD })
  @ApiOperation({
    summary: 'Set a new password using an emailed token',
    description:
      'Public — the token is the credential. Single use. Revokes **every** session, ' +
      'including any the caller currently holds: a reset is what someone does when they ' +
      'believe the account is compromised.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'INVALID_RESET_TOKEN', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordReset.resetPassword(dto.token, dto.password);
  }

  @Patch('password')
  @ApiAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change the caller’s password',
    description:
      'Revokes every other session but keeps this one, so changing a password does not ' +
      'sign you out of the device you changed it on.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'VALIDATION_FAILED | PASSWORD_REUSED',
    type: ErrorResponseDto,
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(user.id, user.sessionId, dto.currentPassword, dto.password);
  }
}

/** Forensic context for the session row (DATABASE.md §4.1). */
const sessionContext = (request: AppRequest): SessionContext => ({
  userAgent: request.header('user-agent'),
  ipAddress: request.ip,
});
