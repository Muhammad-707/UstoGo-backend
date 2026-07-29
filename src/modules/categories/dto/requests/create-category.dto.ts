import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

import { SLUG_PATTERN } from '../../constants/category.constants';

export class CreateCategoryDto {
  @ApiProperty({ minLength: 2, maxLength: 150 })
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiProperty({ example: 'plumbing', description: 'Unique, immutable once created.' })
  @IsString()
  @Length(2, 100)
  @Matches(SLUG_PATTERN, { message: 'slug must be lowercase, alphanumeric, hyphen-separated' })
  slug!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for a root category.' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A confirmed File with purpose CATEGORY_ICON.',
  })
  @IsOptional()
  @IsUUID('4')
  iconFileId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
