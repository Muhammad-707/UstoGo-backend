import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalStatus, type MasterProfile } from '@prisma/client';

export class MasterStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ApprovalStatus })
  approvalStatus!: ApprovalStatus;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ nullable: true })
  rejectionReason!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'B-15 — null until any resolved booking.' })
  reliabilityScore!: string | null;

  @ApiProperty({ description: 'B-24 — opted in to auto-accepting eligible bookings.' })
  instantBookEnabled!: boolean;

  static fromEntity(entity: MasterProfile): MasterStatusResponseDto {
    const dto = new MasterStatusResponseDto();

    dto.id = entity.id;
    dto.approvalStatus = entity.approvalStatus;
    dto.isActive = entity.isActive;
    dto.rejectionReason = entity.rejectionReason;
    dto.reliabilityScore = entity.reliabilityScore?.toFixed(2) ?? null;
    dto.instantBookEnabled = entity.instantBookEnabled;

    return dto;
  }
}
