import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

export class BookingAddressDto {
  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @Length(5, 500)
  @IsSafeText()
  line!: string;

  @ApiProperty({ minLength: 2, maxLength: 150 })
  @IsString()
  @Length(2, 150)
  @IsSafeText()
  district!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}
