import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { Idempotent } from '@modules/idempotency/decorators/idempotent.decorator';

import { Audit } from '../../audit/decorators/audit.decorator';
import { BroadcastNotificationDto } from '../dto/requests/broadcast-notification.dto';
import { NotificationsService } from '../services/notifications.service';

@ApiTags('Admin')
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('broadcast')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.NOTIFICATION_BROADCAST, 'Notification')
  @ApiOperation({
    summary: 'Broadcast a notification',
    description:
      'To a role or a list of user ids. An optional `Idempotency-Key` header (Phase 6) ' +
      'prevents a retried request from sending the broadcast twice.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Client-generated value; replaying it returns the original response.',
  })
  @ApiOkResponse({ schema: { properties: { sent: { type: 'number' } } } })
  @ApiConflictResponse({
    description: 'IDEMPOTENCY_KEY_REUSED | IDEMPOTENCY_KEY_IN_PROGRESS',
    type: ErrorResponseDto,
  })
  async broadcast(@Body() dto: BroadcastNotificationDto): Promise<{ sent: number }> {
    const sent = await this.notifications.broadcast(dto);
    return { sent };
  }
}
