import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { NotificationType, UserRole } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';

/** `POST /admin/notifications/broadcast` (API.md §12) — exactly one of `role`/`userIds`. */
export class BroadcastNotificationDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  userIds?: string[];

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  payload!: Record<string, unknown>;
}
