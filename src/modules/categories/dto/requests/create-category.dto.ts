import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

import { SLUG_PATTERN } from '../../constants/category.constants';

export class CreateCategoryDto {
  @ApiProperty({ minLength: 2, maxLength: 150, description: 'English (fallback) name.' })
  @IsString()
  @Length(2, 150)
  name!: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 150, description: 'Tajik name.' })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  nameTj?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 150, description: 'Russian name.' })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  nameRu?: string;

  @ApiProperty({ example: 'plumbing', description: 'Unique, immutable once created.' })
  @IsString()
  @Length(2, 100)
  @Matches(SLUG_PATTERN, { message: 'slug must be lowercase, alphanumeric, hyphen-separated' })
  slug!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for a root category.' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'English (fallback) description.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Tajik description.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionTj?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Russian description.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionRu?: string;

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
