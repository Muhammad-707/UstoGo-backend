import { ApiPropertyOptional } from '@nestjs/swagger';
import { BannerPosition } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/** `GET /banners` (API.md §11, FR-11.2). */
export class PublicBannersQueryDto {
  @ApiPropertyOptional({ enum: BannerPosition })
  @IsOptional()
  @IsEnum(BannerPosition)
  position?: BannerPosition;
}
