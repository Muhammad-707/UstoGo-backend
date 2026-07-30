import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ApiPaginatedResponse } from '@common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import { PaginatedDto } from '@common/dto/paginated.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { ApiCursorPaginatedResponse } from '../decorators/api-cursor-paginated-response.decorator';
import { ConversationsQueryDto } from '../dto/requests/conversations-query.dto';
import { CreateConversationDto } from '../dto/requests/create-conversation.dto';
import { MessagesQueryDto } from '../dto/requests/messages-query.dto';
import { SendMessageDto } from '../dto/requests/send-message.dto';
import { ConversationResponseDto } from '../dto/responses/conversation.response.dto';
import { CursorPaginatedDto } from '../dto/responses/cursor-paginated.dto';
import { MessageResponseDto } from '../dto/responses/message.response.dto';
import { ConversationsService } from '../services/conversations.service';
import { MessagesService } from '../services/messages.service';

const CONVERSATION_NOT_FOUND = { description: 'CONVERSATION_NOT_FOUND', type: ErrorResponseDto };

/** F-12 (API.md §11). Every route is scoped to the caller's own conversations —
 *  ownership is resolved in the service, never trusted from the route param. */
@ApiTags('Chat')
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
  ) {}

  @Post()
  @ApiAuth()
  @ApiOperation({
    summary: 'Start or resume a conversation',
    description: 'Find-or-create on the (client, master) pair; requires a shared booking.',
  })
  @ApiCreatedResponse({ type: ConversationResponseDto })
  @ApiForbiddenResponse({ description: 'NO_SHARED_BOOKING', type: ErrorResponseDto })
  async create(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConversationResponseDto> {
    const conversation = await this.conversations.findOrCreate(user.id, dto.participantId);
    const unreadCount = await this.conversations.unreadCount(user.id, conversation.id);

    return ConversationResponseDto.fromEntity(conversation, user.id, unreadCount);
  }

  @Get()
  @ApiAuth()
  @ApiOperation({
    summary: 'List the caller’s conversations',
    description: 'Newest activity first.',
  })
  @ApiPaginatedResponse(ConversationResponseDto)
  async list(
    @Query() query: ConversationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedDto<ConversationResponseDto>> {
    const { items, total, unreadByConversation } = await this.conversations.list(
      user.id,
      query.page,
      query.limit,
    );

    return PaginatedDto.from(
      items.map((item) =>
        ConversationResponseDto.fromEntity(item, user.id, unreadByConversation.get(item.id) ?? 0),
      ),
      total,
      query.page,
      query.limit,
    );
  }

  @Get(':id/messages')
  @ApiAuth()
  @ApiOperation({ summary: 'Message history', description: 'Cursor pagination, newest first.' })
  @ApiCursorPaginatedResponse(MessageResponseDto)
  @ApiNotFoundResponse(CONVERSATION_NOT_FOUND)
  async listMessages(
    @Param('id') id: string,
    @Query() query: MessagesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CursorPaginatedDto<MessageResponseDto>> {
    const { items, nextCursor } = await this.messages.list(user.id, id, query.cursor, query.limit);

    return CursorPaginatedDto.from(
      items.map((item) => MessageResponseDto.fromEntity(item)),
      nextCursor,
    );
  }

  @Post(':id/messages')
  @ApiAuth()
  @ApiOperation({ summary: 'Send a message' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  @ApiNotFoundResponse(CONVERSATION_NOT_FOUND)
  @ApiUnprocessableEntityResponse({ description: 'MESSAGE_TOO_LONG', type: ErrorResponseDto })
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponseDto> {
    const message = await this.messages.send(user.id, id, dto);
    return MessageResponseDto.fromEntity(message);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({ summary: 'Mark every unread message in this conversation read' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse(CONVERSATION_NOT_FOUND)
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.messages.markRead(user.id, id);
  }
}
