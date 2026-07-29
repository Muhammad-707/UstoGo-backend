import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';

import { Audit } from '../../audit/decorators/audit.decorator';
import { BroadcastNotificationDto } from '../dto/requests/broadcast-notification.dto';
import { NotificationsService } from '../services/notifications.service';

@ApiTags('Admin')
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.NOTIFICATION_BROADCAST, 'Notification')
  @ApiOperation({
    summary: 'Broadcast a notification',
    description: 'To a role or a list of user ids.',
  })
  @ApiOkResponse({ schema: { properties: { sent: { type: 'number' } } } })
  async broadcast(@Body() dto: BroadcastNotificationDto): Promise<{ sent: number }> {
    const sent = await this.notifications.broadcast(dto);
    return { sent };
  }
}
