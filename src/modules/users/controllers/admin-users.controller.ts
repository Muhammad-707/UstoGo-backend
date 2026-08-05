import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';

import { Audit } from '../../audit/decorators/audit.decorator';
import { AdminUserQueryDto } from '../dto/requests/admin-user-query.dto';
import { ReasonDto } from '../dto/requests/reason.dto';
import { AdminUserListItemResponseDto } from '../dto/responses/admin-user-list-item.response.dto';
import { UserResponseDto } from '../dto/responses/user.response.dto';
import { AdminUsersService } from '../services/admin-users.service';

const NOT_FOUND = { description: 'USER_NOT_FOUND', type: ErrorResponseDto };
const ALREADY_IN_STATUS = { description: 'USER_ALREADY_IN_STATUS', type: ErrorResponseDto };

/** §6.11 (MASTER_PROMPT.md). */
@ApiTags('Admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List users',
    description: 'Filterable by role, status, city, search (email/name) and registration date.',
  })
  @ApiPaginatedResponse(AdminUserListItemResponseDto)
  async list(
    @Query() query: AdminUserQueryDto,
  ): Promise<PaginatedDto<AdminUserListItemResponseDto>> {
    const { items, total } = await this.users.list(query);

    return PaginatedDto.from(
      items.map((item) => AdminUserListItemResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @ApiAuth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Full account detail' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async getById(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.users.getById(id);

    return UserResponseDto.fromEntity(user);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.USER_BLOCKED, 'User')
  @ApiOperation({
    summary: 'Block an account',
    description: 'Revokes every active session; login is rejected while blocked.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(ALREADY_IN_STATUS)
  async block(@Param('id') id: string, @Body() _dto: ReasonDto): Promise<UserResponseDto> {
    const user = await this.users.block(id);

    return UserResponseDto.fromEntity(user);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.USER_UNBLOCKED, 'User')
  @ApiOperation({ summary: 'Unblock an account' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse(ALREADY_IN_STATUS)
  async unblock(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.users.unblock(id);

    return UserResponseDto.fromEntity(user);
  }
}
