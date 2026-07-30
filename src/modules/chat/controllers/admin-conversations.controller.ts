import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';

import { Audit } from '../../audit/decorators/audit.decorator';
import { ApiCursorPaginatedResponse } from '../decorators/api-cursor-paginated-response.decorator';
import { MessagesQueryDto } from '../dto/requests/messages-query.dto';
import { CursorPaginatedDto } from '../dto/responses/cursor-paginated.dto';
import { MessageResponseDto } from '../dto/responses/message.response.dto';
import { MessagesService } from '../services/messages.service';

/**
 * USER_ROLES.md: "Access chat in a flagged dispute (audited)" — the one sensitive
 * read admins are permitted, and `AuditAction.CONVERSATION_ACCESSED` exists
 * precisely so it leaves a trail (AUTHORIZATION.md §6, BR-63). There is no in-app
 * flagging mechanism in v1 (dispute arbitration is out of scope per BACKLOG.md) —
 * "flagged" is a support process outside this API, so this route is reachable by
 * any admin for any conversation, and every call is audited rather than gated on a
 * flag column that does not exist. Documented in `STATUS.md`.
 */
@ApiTags('Admin')
@Controller('admin/conversations')
export class AdminConversationsController {
  constructor(private readonly messages: MessagesService) {}

  @Get(':id/messages')
  @ApiAuth(UserRole.ADMIN)
  @Audit(AuditAction.CONVERSATION_ACCESSED, 'Conversation')
  @ApiOperation({ summary: 'Read a conversation’s messages', description: 'Audited (BR-63).' })
  @ApiCursorPaginatedResponse(MessageResponseDto)
  @ApiNotFoundResponse({ description: 'CONVERSATION_NOT_FOUND', type: ErrorResponseDto })
  async listMessages(
    @Param('id') id: string,
    @Query() query: MessagesQueryDto,
  ): Promise<CursorPaginatedDto<MessageResponseDto>> {
    const { items, nextCursor } = await this.messages.listForAdmin(id, query.cursor, query.limit);

    return CursorPaginatedDto.from(
      items.map((item) => MessageResponseDto.fromEntity(item)),
      nextCursor,
    );
  }
}
