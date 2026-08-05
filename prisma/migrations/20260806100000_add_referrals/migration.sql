-- MASTER_PROMPT.md §6.4 — referral codes and the reward ledger. Purely additive
-- (NFR-A-3 expand/contract): new nullable columns and a new table only.

-- AlterTable
ALTER TABLE "client_profiles" ADD COLUMN     "referral_code" VARCHAR(12),
ADD COLUMN     "referred_by_client_profile_id" UUID;

-- CreateTable
CREATE TABLE "referral_rewards" (
    "id" UUID NOT NULL,
    "referrer_client_profile_id" UUID NOT NULL,
    "referred_client_profile_id" UUID NOT NULL,
    "trigger_booking_id" UUID NOT NULL,
    "bonus_amount" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_trigger_booking_id_key" ON "referral_rewards"("trigger_booking_id");

-- CreateIndex
CREATE INDEX "referral_rewards_referrer_client_profile_id_idx" ON "referral_rewards"("referrer_client_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_referral_code_key" ON "client_profiles"("referral_code");

-- CreateIndex
CREATE INDEX "client_profiles_referred_by_client_profile_id_idx" ON "client_profiles"("referred_by_client_profile_id");

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_referred_by_client_profile_id_fkey" FOREIGN KEY ("referred_by_client_profile_id") REFERENCES "client_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrer_client_profile_id_fkey" FOREIGN KEY ("referrer_client_profile_id") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referred_client_profile_id_fkey" FOREIGN KEY ("referred_client_profile_id") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_trigger_booking_id_fkey" FOREIGN KEY ("trigger_booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
