-- CreateEnum
CREATE TYPE "cancellation_reason_code" AS ENUM ('CHANGED_MIND', 'FOUND_ANOTHER_PROVIDER', 'PRICE_TOO_HIGH', 'SCHEDULING_CONFLICT', 'NO_LONGER_NEEDED', 'UNRESPONSIVE_OTHER_PARTY', 'EMERGENCY', 'OTHER');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancellation_reason_code" "cancellation_reason_code";
