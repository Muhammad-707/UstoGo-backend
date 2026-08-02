import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One portfolio image with its short-lived read URL. */
export class MasterPortfolioImageUrlDto {
  @ApiProperty({ format: 'uuid' })
  fileId!: string;

  @ApiPropertyOptional({ nullable: true })
  caption!: string | null;

  @ApiProperty({ description: 'Short-lived presigned read URL' })
  url!: string;
}

/**
 * Every visual of a public master minted as short-lived URLs. The public projections
 * deliberately return file ids, never URLs; this endpoint is the one place the master
 * profile page turns them into something an `<img>` can render.
 */
export class MasterMediaResponseDto {
  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bannerUrl!: string | null;

  @ApiProperty({ type: MasterPortfolioImageUrlDto, isArray: true })
  portfolio!: MasterPortfolioImageUrlDto[];
}
