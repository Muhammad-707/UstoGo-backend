import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import {
  ApiConflictResponse,
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

import { SetAvatarDto } from '../dto/requests/set-avatar.dto';
import { UpdateProfileDto } from '../dto/requests/update-profile.dto';
import { DataExportResponseDto } from '../dto/responses/data-export.response.dto';
import { UserResponseDto } from '../dto/responses/user.response.dto';
import { DataExportService } from '../services/data-export.service';
import { UsersService } from '../services/users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly dataExport: DataExportService,
  ) {}

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

  @Patch('me/avatar')
  @ApiAuth()
  @ApiOperation({
    summary: 'Attach a confirmed file as the caller’s avatar',
    description:
      'Step 3 of the upload flow: presign, PUT the binary, then attach. The file must ' +
      'already be confirmed and have purpose AVATAR — this endpoint attaches bytes the ' +
      'server has verified rather than accepting any. The previous avatar is released ' +
      'for cleanup.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'FILE_NOT_CONFIRMED', type: ErrorResponseDto })
  async setAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetAvatarDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.setAvatar(user.id, dto.fileId));
  }

  @Get('me/export')
  @ApiAuth()
  @ApiOperation({
    summary: 'Export the caller’s own personal data',
    description:
      'Everything the caller is themself the subject of: account, profile, bookings, ' +
      'reviews and notifications, returned synchronously as JSON.',
  })
  @ApiOkResponse({ type: DataExportResponseDto })
  async exportMe(@CurrentUser() user: AuthenticatedUser): Promise<DataExportResponseDto> {
    return this.dataExport.export(user.id, user.role);
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
