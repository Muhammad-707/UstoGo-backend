import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { SessionResponseDto } from '../dto/responses/session.response.dto';
import { TokenService } from '../services/token.service';

/** Device/session list and per-device revocation (Phase 6, `SRS-AUTH-6`). */
@ApiTags('Auth')
@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly tokens: TokenService) {}

  @Get()
  @ApiAuth()
  @ApiOperation({
    summary: 'List active devices (sessions)',
    description:
      'One row per refresh-token family, most recently active first. `current` marks ' +
      'the session the request was authenticated with.',
  })
  @ApiOkResponse({ type: SessionResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<SessionResponseDto[]> {
    const sessions = await this.tokens.listSessions(user.id, user.sessionId);
    return sessions.map((session) => SessionResponseDto.from(session));
  }

  @Delete(':id')
  @ApiAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke one device',
    description:
      'Logs that device out. Revoking the current session is allowed — it behaves ' +
      'like POST /auth/logout for this device.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND', type: ErrorResponseDto })
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.tokens.revokeSession(user.id, id);
  }
}
