import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction, type AuditLog } from '@prisma/client';

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  actorUserId!: string;

  @ApiProperty({ enum: AuditAction })
  action!: AuditAction;

  @ApiProperty({ example: 'Category' })
  entityType!: string;

  @ApiProperty({ format: 'uuid' })
  entityId!: string;

  @ApiPropertyOptional({ type: Object, nullable: true, description: 'The submitted payload' })
  before!: unknown;

  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description: 'The resulting representation',
  })
  after!: unknown;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  ipAddress!: string | null;

  @ApiPropertyOptional({ nullable: true })
  userAgent!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: AuditLog): AuditLogResponseDto {
    const dto = new AuditLogResponseDto();

    dto.id = entity.id;
    dto.actorUserId = entity.actorUserId;
    dto.action = entity.action;
    dto.entityType = entity.entityType;
    dto.entityId = entity.entityId;
    dto.before = entity.before;
    dto.after = entity.after;
    dto.reason = entity.reason;
    dto.ipAddress = entity.ipAddress;
    dto.userAgent = entity.userAgent;
    dto.createdAt = entity.createdAt;

    return dto;
  }
}
