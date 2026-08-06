import { ApiProperty } from '@nestjs/swagger';
import type { QuickReply } from '@prisma/client';

export class QuickReplyResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() text!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() createdAt!: string;

  static fromEntity(reply: QuickReply): QuickReplyResponseDto {
    return {
      id: reply.id,
      text: reply.text,
      sortOrder: reply.sortOrder,
      createdAt: reply.createdAt.toISOString(),
    };
  }
}
