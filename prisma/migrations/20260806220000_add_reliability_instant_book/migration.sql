-- AlterTable
ALTER TABLE "master_profiles" ADD COLUMN     "reliability_score" DECIMAL(5,2),
ADD COLUMN     "instant_book_enabled" BOOLEAN NOT NULL DEFAULT false;
