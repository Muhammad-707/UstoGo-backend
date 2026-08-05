import { ApiProperty } from '@nestjs/swagger';
import { ReportType } from '@prisma/client';
import { IsEnum, IsString, IsUUID, Length } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

/** `POST /reports` (MASTER_PROMPT.md §6.8). */
export class CreateReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  reportedUserId!: string;

  @ApiProperty({ enum: ReportType, enumName: 'ReportType' })
  @IsEnum(ReportType)
  type!: ReportType;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @Length(10, 1000)
  @IsSafeText()
  description!: string;
}
