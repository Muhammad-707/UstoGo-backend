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

  static fromEntity(entity: MasterProfile): MasterStatusResponseDto {
    const dto = new MasterStatusResponseDto();

    dto.id = entity.id;
    dto.approvalStatus = entity.approvalStatus;
    dto.isActive = entity.isActive;
    dto.rejectionReason = entity.rejectionReason;

    return dto;
  }
}
