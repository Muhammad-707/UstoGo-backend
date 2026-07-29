import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewStatus, type Review, type ReviewReply } from '@prisma/client';

import { ReviewReplyResponseDto } from './review-reply.response.dto';

export type ReviewWithReply = Review & { reply: ReviewReply | null };

/** `Review` + optional `ReviewReply` (DATABASE.md §8, FR-8.5). */
export class ReviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  bookingId!: string;

  @ApiProperty({ format: 'uuid' })
  clientId!: string;

  @ApiProperty({ format: 'uuid' })
  masterId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating!: number;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiProperty({ enum: ReviewStatus })
  status!: ReviewStatus;

  @ApiPropertyOptional({ nullable: true })
  editedAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ type: ReviewReplyResponseDto, nullable: true })
  reply!: ReviewReplyResponseDto | null;

  static fromEntity(entity: ReviewWithReply): ReviewResponseDto {
    const dto = new ReviewResponseDto();

    dto.id = entity.id;
    dto.bookingId = entity.bookingId;
    dto.clientId = entity.clientProfileId;
    dto.masterId = entity.masterProfileId;
    dto.rating = entity.rating;
    dto.comment = entity.comment;
    dto.status = entity.status;
    dto.editedAt = entity.editedAt?.toISOString() ?? null;
    dto.createdAt = entity.createdAt.toISOString();
    dto.reply = entity.reply === null ? null : ReviewReplyResponseDto.fromEntity(entity.reply);

    return dto;
  }
}
