import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Conversation } from '@prisma/client';

export type ConversationWithParticipants = Conversation & {
  clientProfile: { userId: string; firstName: string; lastName: string };
  masterProfile: { userId: string; displayName: string };
};

/**
 * `Conversation` from one caller's point of view (DATABASE.md §9.1). `participant*`
 * always describes the *other* side — a client never needs their own name back —
 * which is why this is computed against `callerUserId` rather than mapped
 * unconditionally from the entity.
 */
export class ConversationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  participantUserId!: string;

  @ApiProperty()
  participantName!: string;

  @ApiPropertyOptional({ nullable: true })
  lastMessageAt!: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  lastMessagePreview!: string | null;

  @ApiProperty({ description: 'Messages in this conversation not sent by the caller, unread.' })
  unreadCount!: number;

  @ApiProperty()
  createdAt!: string;

  static fromEntity(
    entity: ConversationWithParticipants,
    callerUserId: string,
    unreadCount: number,
  ): ConversationResponseDto {
    const dto = new ConversationResponseDto();
    const callerIsClient = entity.clientProfile.userId === callerUserId;

    dto.id = entity.id;
    dto.participantUserId = callerIsClient
      ? entity.masterProfile.userId
      : entity.clientProfile.userId;
    dto.participantName = callerIsClient
      ? entity.masterProfile.displayName
      : `${entity.clientProfile.firstName} ${entity.clientProfile.lastName}`;
    dto.lastMessageAt = entity.lastMessageAt?.toISOString() ?? null;
    dto.lastMessagePreview = entity.lastMessagePreview;
    dto.unreadCount = unreadCount;
    dto.createdAt = entity.createdAt.toISOString();

    return dto;
  }
}
