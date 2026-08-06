import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { CreateQuickReplyDto } from '../dto/requests/create-quick-reply.dto';
import { UpdateQuickReplyDto } from '../dto/requests/update-quick-reply.dto';
import { QuickReplyResponseDto } from '../dto/responses/quick-reply.response.dto';
import { QuickRepliesService } from '../services/quick-replies.service';

const NOT_FOUND = { description: 'MASTER_NOT_FOUND', type: ErrorResponseDto };

/**
 * B-35 quick-reply CRUD — split out of `MastersMeController` to keep it under
 * CODING_STANDARDS.md's 300-line cap. `masters/me/*` still registers ahead of the
 * public `masters/:id` wildcard (MastersModule's route-order note) as long as this
 * controller is listed in that same position; it makes no difference which file the
 * routes live in.
 */
@ApiTags('Master Cabinet')
@Controller('masters/me/quick-replies')
export class MasterQuickRepliesController {
  constructor(private readonly quickReplies: QuickRepliesService) {}

  @Get()
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'The caller’s chat quick replies, in display order' })
  @ApiOkResponse({ type: QuickReplyResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<QuickReplyResponseDto[]> {
    const replies = await this.quickReplies.list(user.id);

    return replies.map((reply) => QuickReplyResponseDto.fromEntity(reply));
  }

  @Post()
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Add a canned reply for chat' })
  @ApiCreatedResponse({ type: QuickReplyResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'VALIDATION_FAILED | QUICK_REPLY_LIMIT_EXCEEDED',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse(NOT_FOUND)
  async create(
    @Body() dto: CreateQuickReplyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuickReplyResponseDto> {
    const reply = await this.quickReplies.create(user.id, dto);

    return QuickReplyResponseDto.fromEntity(reply);
  }

  @Patch(':replyId')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Edit a quick reply' })
  @ApiOkResponse({ type: QuickReplyResponseDto })
  @ApiNotFoundResponse({ description: 'QUICK_REPLY_NOT_FOUND', type: ErrorResponseDto })
  async update(
    @Param('replyId') replyId: string,
    @Body() dto: UpdateQuickReplyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuickReplyResponseDto> {
    const reply = await this.quickReplies.update(user.id, replyId, dto);

    return QuickReplyResponseDto.fromEntity(reply);
  }

  @Delete(':replyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Remove a quick reply', description: 'Soft delete; idempotent.' })
  @ApiNoContentResponse()
  async remove(
    @Param('replyId') replyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.quickReplies.remove(user.id, replyId);
  }
}
