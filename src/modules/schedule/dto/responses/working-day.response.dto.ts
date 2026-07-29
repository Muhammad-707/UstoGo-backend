import { ApiProperty } from '@nestjs/swagger';
import type { WorkingDay } from '@prisma/client';

const toHhMm = (time: Date): string => time.toISOString().slice(11, 16);

export class WorkingDayResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 0, maximum: 6 })
  weekday!: number;

  @ApiProperty({ example: '09:00' })
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  endTime!: string;

  static fromEntity(entity: WorkingDay): WorkingDayResponseDto {
    const dto = new WorkingDayResponseDto();
    dto.id = entity.id;
    dto.weekday = entity.weekday;
    dto.startTime = toHhMm(entity.startTime);
    dto.endTime = toHhMm(entity.endTime);
    return dto;
  }
}
