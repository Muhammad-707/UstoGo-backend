import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BannerPosition } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { IsAfterFieldIfPresent } from '../../domain/is-after-field-if-present.validator';

/** `POST /admin/banners` (API.md §12, FR-11.2). */
export class CreateBannerDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  /**
   * Id of the admin's own confirmed `File` row (`FilePurpose.BANNER`). Named
   * `imageKey` after the FR-11.2 contract; the value is the same confirmed-file id
   * every other attachment point takes — `CreateCategoryDto.iconFileId`,
   * `SendMessageDto.attachmentKeys` — never a raw storage key, which would let a
   * client probe or reuse an object it does not own. Resolved and ownership-checked
   * by `FilesService.getAttachable`.
   */
  @ApiProperty({ format: 'uuid', description: "A confirmed File with purpose 'BANNER'." })
  @IsUUID('4')
  imageKey!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  linkUrl?: string;

  @ApiProperty({ enum: BannerPosition })
  @IsEnum(BannerPosition)
  position!: BannerPosition;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'ISO-8601. Omit for "always started".' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ description: 'ISO-8601. Omit for "never expires".' })
  @IsOptional()
  @IsDateString()
  @IsAfterFieldIfPresent('startsAt')
  endsAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
