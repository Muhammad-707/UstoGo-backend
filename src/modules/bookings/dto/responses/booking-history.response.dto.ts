import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActorType, BookingStatus, type BookingStatusHistory } from '@prisma/client';

/** `GET /bookings/:id` — the append-only trail (DATABASE.md §7.2). */
export class BookingHistoryEntryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ enum: BookingStatus, nullable: true })
  fromStatus!: BookingStatus | null;

  @ApiProperty({ enum: BookingStatus })
  toStatus!: BookingStatus;

  @ApiProperty({ enum: ActorType })
  actorType!: ActorType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiProperty()
  createdAt!: string;

  static fromEntity(entity: BookingStatusHistory): BookingHistoryEntryResponseDto {
    const dto = new BookingHistoryEntryResponseDto();

    dto.id = entity.id;
    dto.fromStatus = entity.fromStatus;
    dto.toStatus = entity.toStatus;
    dto.actorType = entity.actorType;
    dto.actorUserId = entity.actorUserId;
    dto.reason = entity.reason;
    dto.createdAt = entity.createdAt.toISOString();

    return dto;
  }
}
