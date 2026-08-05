-- MASTER_PROMPT.md §6.4 — at most one reward per referred client, ever. This is the
-- concurrency guard for the post-commit reward listener (see the schema comment on
-- ReferralReward.referredClientProfileId).

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_referred_client_profile_id_key" ON "referral_rewards"("referred_client_profile_id");
