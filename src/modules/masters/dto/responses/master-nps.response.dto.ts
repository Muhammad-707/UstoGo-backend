import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** `GET /masters/me/nps` (MASTER_PROMPT.md §6.1) — the caller's own NPS breakdown. */
export class MasterNpsResponseDto {
  @ApiPropertyOptional({ nullable: true, description: 'null when there are no responses yet.' })
  nps!: number | null;

  @ApiProperty()
  promoters!: number;

  @ApiProperty()
  passives!: number;

  @ApiProperty()
  detractors!: number;

  @ApiProperty()
  responseCount!: number;
}
