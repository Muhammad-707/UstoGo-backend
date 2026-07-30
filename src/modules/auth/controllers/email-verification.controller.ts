import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { THROTTLE } from '../constants/throttle.constants';
import { VerifyEmailDto } from '../dto/requests/credentials.dto';
import { EmailVerificationService } from '../services/email-verification.service';

const VALIDATION_FAILED = { description: 'VALIDATION_FAILED', type: ErrorResponseDto };
const RATE_LIMITED = { description: 'TOO_MANY_REQUESTS', type: ErrorResponseDto };

@ApiTags('Auth')
@Controller('auth')
export class EmailVerificationController {
  constructor(private readonly emailVerification: EmailVerificationService) {}

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: THROTTLE.VERIFY_EMAIL })
  @ApiOperation({
    summary: 'Confirm an email address using the emailed token',
    description:
      'Public — the token is the credential. Single use. Sets `emailVerifiedAt`; nothing ' +
      'else in v1 is gated on it.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'INVALID_VERIFICATION_TOKEN', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.emailVerification.verify(dto.token);
  }

  @Post('resend-verification')
  @ApiAuth()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: THROTTLE.RESEND_VERIFICATION })
  @ApiOperation({
    summary: 'Resend the email verification link',
    description: 'Any previously issued verification link stops working.',
  })
  @ApiAcceptedResponse()
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_VERIFIED', type: ErrorResponseDto })
  @ApiTooManyRequestsResponse(RATE_LIMITED)
  async resendVerification(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.emailVerification.resend(user.id);
  }
}
