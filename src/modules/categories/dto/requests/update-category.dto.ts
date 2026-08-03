import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/** No `slug` field — immutable once created (FR-5.2). */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 150, description: 'English (fallback) name.' })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  name?: string;

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

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'null moves the category to the root.',
  })
  @IsOptional()
  @IsUUID('4')
  parentId?: string | null;

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

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  iconFileId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
