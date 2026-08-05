import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional({
    example: 'AZIZ4F2A',
    description:
      'MASTER_PROMPT.md §6.4 — another client’s referral code, from ?ref=CODE. ' +
      'Silently ignored if it does not match anyone; registration never fails on this field.',
  })
  @IsOptional()
  @IsString()
  @Length(4, 12)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  referralCode?: string;
}
