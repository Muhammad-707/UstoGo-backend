import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PaginatedDto } from '@common/dto/paginated.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { NotificationsQueryDto } from '../dto/requests/notifications-query.dto';
import { NotificationResponseDto } from '../dto/responses/notification.response.dto';
import { UnreadCountResponseDto } from '../dto/responses/unread-count.response.dto';
import { NotificationsService } from '../services/notifications.service';

/** F-11 (API.md §11). Every route is scoped strictly to the caller — no admin override. */
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiAuth()
  @ApiOperation({ summary: 'List the caller’s notifications' })
  @ApiPaginatedResponse(NotificationResponseDto)
  async list(
    @Query() query: NotificationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDto<NotificationResponseDto>> {
    const { items, total } = await this.notifications.list(user.id, query);

    return PaginatedDto.from(
      items.map((item) => NotificationResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }

  @Get('unread-count')
  @ApiAuth()
  @ApiOperation({ summary: 'Count of unread notifications' })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCountResponseDto> {
    const count = await this.notifications.unreadCount(user.id);
    return { count };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({ summary: 'Mark one notification read', description: 'Idempotent.' })
  @ApiNoContentResponse()
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({ summary: 'Mark every notification read' })
  @ApiNoContentResponse()
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }
}
