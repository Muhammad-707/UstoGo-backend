import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

/** `GET /admin/users` (MASTER_PROMPT.md §6.11). */
export class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ format: 'uuid', description: "The account's client or master city." })
  @IsOptional()
  @IsUUID('4')
  cityId?: string;

  @ApiPropertyOptional({ description: 'Matches email or profile first/last name.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'ISO-8601, inclusive lower bound on createdAt.' })
  @IsOptional()
  @IsISO8601()
  registeredFrom?: string;

  @ApiPropertyOptional({ description: 'ISO-8601, inclusive upper bound on createdAt.' })
  @IsOptional()
  @IsISO8601()
  registeredTo?: string;
}
