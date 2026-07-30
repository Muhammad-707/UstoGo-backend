import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Message } from '@prisma/client';

import {
  MessageAttachmentResponseDto,
  type AttachmentWithUrl,
} from './message-attachment.response.dto';

export type MessageWithAttachments = Message & { attachments: AttachmentWithUrl[] };

/** `Message` + resolved attachments (DATABASE.md §9.2). Never exposes `deletedAt` —
 *  a soft-deleted message is filtered out of every listing before it reaches here. */
export class MessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ format: 'uuid' })
  senderUserId!: string;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({ nullable: true })
  readAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: [MessageAttachmentResponseDto] })
  attachments!: MessageAttachmentResponseDto[];

  static fromEntity(entity: MessageWithAttachments): MessageResponseDto {
    const dto = new MessageResponseDto();

    dto.id = entity.id;
    dto.conversationId = entity.conversationId;
    dto.senderUserId = entity.senderUserId;
    dto.body = entity.body;
    dto.readAt = entity.readAt?.toISOString() ?? null;
    dto.createdAt = entity.createdAt.toISOString();
    dto.attachments = entity.attachments.map((attachment) =>
      MessageAttachmentResponseDto.fromEntity(attachment),
    );

    return dto;
  }
}
