import { ApiProperty } from '@nestjs/swagger';
import { NotificationType, type Notification, Prisma } from '@prisma/client';

/** FR-9.2: the server never stores rendered prose — clients localise from `type` + `payload`. */
export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Prisma.JsonValue;

  @ApiProperty()
  isRead!: boolean;

  @ApiProperty()
  createdAt!: string;

  static fromEntity(entity: Notification): NotificationResponseDto {
    const dto = new NotificationResponseDto();

    dto.id = entity.id;
    dto.type = entity.type;
    dto.payload = entity.payload;
    dto.isRead = entity.isRead;
    dto.createdAt = entity.createdAt.toISOString();

    return dto;
  }
}
