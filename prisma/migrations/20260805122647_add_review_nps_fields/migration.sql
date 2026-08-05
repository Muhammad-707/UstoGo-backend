-- NPS survey (§6.1, MASTER_PROMPT.md): "how likely are you to recommend this master?"
-- collected alongside the existing star rating, both optional so a client who skips
-- the survey still leaves a plain review.

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "nps_score" SMALLINT,
ADD COLUMN     "would_recommend" BOOLEAN;

-- Same style as ck_master_profiles_rating_average (20260728221845): a DTO-level
-- @Min(0)/@Max(10) already guards the API boundary, this is the belt-and-suspenders
-- database-level guarantee for anything that writes the column outside the API.
ALTER TABLE "reviews"
  ADD CONSTRAINT "ck_reviews_nps_score"
  CHECK ("nps_score" IS NULL OR "nps_score" BETWEEN 0 AND 10);
