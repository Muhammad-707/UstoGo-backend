import { ApiProperty } from '@nestjs/swagger';

import { MasterPublicResponseDto } from './master-public.response.dto';

export const LEADERBOARD_BADGES = [
  'TOP_RATED',
  'MOST_BOOKED',
  'FAST_RESPONDER',
  'RISING_STAR',
] as const;
export type LeaderboardBadge = (typeof LEADERBOARD_BADGES)[number];

export class MasterLeaderboardEntryDto {
  @ApiProperty({ example: 1, description: '1-based position in this result set.' })
  rank!: number;

  @ApiProperty({ enum: LEADERBOARD_BADGES, isArray: true })
  badges!: LeaderboardBadge[];

  @ApiProperty({ type: MasterPublicResponseDto })
  master!: MasterPublicResponseDto;
}
