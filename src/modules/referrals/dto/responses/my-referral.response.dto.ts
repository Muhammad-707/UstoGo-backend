import { ApiProperty } from '@nestjs/swagger';

/**
 * `GET /me/referral` (MASTER_PROMPT.md §6.4). No `link` field — the API has no
 * opinion on the client application's own origin/routing, so the frontend builds
 * `${origin}/auth/register/client?ref=${code}` itself.
 */
export class MyReferralResponseDto {
  @ApiProperty({ example: 'AZIZ4F2A' })
  code!: string;

  @ApiProperty({ description: 'Clients who registered with this code.' })
  referredCount!: number;

  @ApiProperty({ description: 'Referrals that reached a first COMPLETED booking.' })
  rewardCount!: number;

  @ApiProperty({ description: 'Sum of bonusAmount across every reward earned as the referrer.' })
  totalBonus!: number;
}
