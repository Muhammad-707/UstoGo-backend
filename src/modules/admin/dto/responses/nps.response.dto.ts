import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NpsByCategoryDto {
  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty()
  categoryName!: string;

  @ApiPropertyOptional({ nullable: true })
  nps!: number | null;

  @ApiProperty()
  responseCount!: number;
}

export class NpsByMasterDto {
  @ApiProperty({ format: 'uuid' })
  masterId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ nullable: true })
  nps!: number | null;

  @ApiProperty()
  responseCount!: number;
}

/**
 * `GET /admin/nps` (MASTER_PROMPT.md §6.1) — platform-wide satisfaction, the input
 * §5's admin statistics ("chand nafar rozi, chand nafar tavsia medihad") reads.
 */
export class NpsResponseDto {
  @ApiPropertyOptional({ nullable: true, description: 'null when there are no responses yet.' })
  overallNps!: number | null;

  @ApiProperty()
  promoters!: number;

  @ApiProperty()
  passives!: number;

  @ApiProperty()
  detractors!: number;

  @ApiProperty()
  responseCount!: number;

  @ApiProperty({ type: NpsByCategoryDto, isArray: true })
  byCategory!: NpsByCategoryDto[];

  @ApiProperty({
    type: NpsByMasterDto,
    isArray: true,
    description: 'Top 10 masters by response count.',
  })
  byMaster!: NpsByMasterDto[];
}
