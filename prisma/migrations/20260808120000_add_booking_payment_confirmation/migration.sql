-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'PAYMENT_CONFIRMED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "paid_amount" DECIMAL(12,2),
ADD COLUMN     "payment_note" VARCHAR(500),
ADD COLUMN     "payment_confirmed_at" TIMESTAMPTZ(3);

-- Client-recorded, off-platform confirmation only (never negative). BookingsModule
-- never processes a real payment — this row just records what the client says
-- changed hands, the same way `Review` records satisfaction.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_paid_amount_check"
  CHECK ("paid_amount" IS NULL OR "paid_amount" >= 0);
