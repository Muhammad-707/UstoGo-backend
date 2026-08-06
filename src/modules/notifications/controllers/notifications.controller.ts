import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { NotificationType } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PaginatedDto } from '@common/dto/paginated.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { NotificationsQueryDto } from '../dto/requests/notifications-query.dto';
import { UpdateNotificationPreferencesDto } from '../dto/requests/update-notification-preferences.dto';
import { NotificationResponseDto } from '../dto/responses/notification.response.dto';
import { UnreadCountResponseDto } from '../dto/responses/unread-count.response.dto';
import { NotificationsService } from '../services/notifications.service';

const PREFERENCES_SCHEMA = {
  type: 'object' as const,
  additionalProperties: { type: 'boolean' as const },
  example: { BOOKING_REMINDER: false, BOOKING_CREATED: true },
};

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

  @Get('preferences')
  @ApiAuth()
  @ApiOperation({
    summary: 'The caller’s per-type notification preferences (B-36)',
    description:
      'Every `NotificationType`, defaulting to `true` where the caller has no ' +
      'override — only push/email/SMS channels do not exist yet to gate independently.',
  })
  @ApiOkResponse({ schema: PREFERENCES_SCHEMA })
  async preferences(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<NotificationType, boolean>> {
    return this.notifications.listPreferences(user.id);
  }

  @Patch('preferences')
  @ApiAuth()
  @ApiOperation({ summary: 'Enable or disable specific notification types' })
  @ApiOkResponse({ schema: PREFERENCES_SCHEMA })
  async updatePreferences(
    @Body() dto: UpdateNotificationPreferencesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<NotificationType, boolean>> {
    return this.notifications.updatePreferences(user.id, dto.preferences);
  }
}
