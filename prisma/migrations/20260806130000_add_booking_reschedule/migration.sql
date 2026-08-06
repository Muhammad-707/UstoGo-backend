-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'BOOKING_RESCHEDULED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "reschedule_count" INTEGER NOT NULL DEFAULT 0;
