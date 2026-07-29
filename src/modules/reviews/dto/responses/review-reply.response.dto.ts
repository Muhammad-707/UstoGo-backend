import { ApiProperty } from '@nestjs/swagger';
import type { ReviewReply } from '@prisma/client';

export class ReviewReplyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  createdAt!: string;

  static fromEntity(entity: ReviewReply): ReviewReplyResponseDto {
    const dto = new ReviewReplyResponseDto();

    dto.id = entity.id;
    dto.body = entity.body;
    dto.createdAt = entity.createdAt.toISOString();

    return dto;
  }
}
