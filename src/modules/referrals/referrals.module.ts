import { Module } from '@nestjs/common';

import { ReferralsController } from './controllers/referrals.controller';
import { ReferralRewardListener } from './listeners/referral-reward.listener';
import { ReferralsService } from './services/referrals.service';

/** §6.4 (MASTER_PROMPT.md) — referral codes and the reward ledger. */
@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralRewardListener],
  exports: [ReferralsService],
})
export class ReferralsModule {}
