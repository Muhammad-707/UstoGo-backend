import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { UpdateProfileDto } from '../dto/requests/update-profile.dto';
import { UserResponseDto } from '../dto/responses/user.response.dto';
import { UsersService } from '../services/users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiAuth()
  @ApiOperation({
    summary: 'Read the caller’s own account and profile',
    description:
      'Returns the user together with whichever profile their role implies. Never returns ' +
      'the password hash, refresh tokens or moderation notes — the projection does not ' +
      'fetch them.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  async findMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.findMe(user.id));
  }

  @Patch('me')
  @ApiAuth()
  @ApiOperation({
    summary: 'Update the caller’s own profile',
    description:
      'Partial update. Email and role are not updatable here: email needs re-verification ' +
      'and role is fixed at creation. A field belonging to the other role — `displayName` ' +
      'sent by a client, say — is rejected rather than ignored.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'VALIDATION_FAILED — including a field that does not apply to the caller’s role',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({ description: 'CITY_NOT_FOUND', type: ErrorResponseDto })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.updateMe(user.id, dto));
  }

  @Delete('me')
  @ApiAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate the caller’s own account',
    description:
      'Soft delete. Every session is revoked immediately, and the email and phone become ' +
      'available for registration again. Historical bookings and reviews are retained, ' +
      'with the author shown as a redacted placeholder.',
  })
  @ApiNoContentResponse()
  async deleteMe(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.users.deleteMe(user.id);
  }
}
