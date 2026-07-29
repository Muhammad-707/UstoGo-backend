import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ScheduleException } from '@prisma/client';

const toHhMm = (time: Date | null): string | null =>
  time === null ? null : time.toISOString().slice(11, 16);
const toYyyyMmDd = (date: Date): string => date.toISOString().slice(0, 10);

export class ScheduleExceptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '2026-08-15' })
  date!: string;

  @ApiProperty()
  isDayOff!: boolean;

  @ApiPropertyOptional({ example: '09:00', nullable: true })
  startTime!: string | null;

  @ApiPropertyOptional({ example: '13:00', nullable: true })
  endTime!: string | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  static fromEntity(entity: ScheduleException): ScheduleExceptionResponseDto {
    const dto = new ScheduleExceptionResponseDto();
    dto.id = entity.id;
    dto.date = toYyyyMmDd(entity.date);
    dto.isDayOff = entity.isDayOff;
    dto.startTime = toHhMm(entity.startTime);
    dto.endTime = toHhMm(entity.endTime);
    dto.note = entity.note;
    return dto;
  }
}
