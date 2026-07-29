import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { E164, RegisterBaseDto, trimValue } from './register-base.dto';

/** FR-1.1. Phone and city are optional for clients. */
export class RegisterClientDto extends RegisterBaseDto {
  @ApiPropertyOptional({ example: '+998901234567', description: 'E.164' })
  @IsOptional()
  @IsString()
  @Matches(E164, { message: 'phone must be in E.164 format, for example +998901234567' })
  @MaxLength(20)
  @Transform(trimValue)
  phone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  cityId?: string;
}
