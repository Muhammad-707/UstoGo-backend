-- CreateTable
CREATE TABLE "recently_viewed_masters" (
    "id" UUID NOT NULL,
    "client_profile_id" UUID NOT NULL,
    "master_profile_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recently_viewed_masters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recently_viewed_masters_client_profile_id_master_profile_key" ON "recently_viewed_masters"("client_profile_id", "master_profile_id");

-- CreateIndex
CREATE INDEX "recently_viewed_masters_client_profile_id_viewed_at_idx" ON "recently_viewed_masters"("client_profile_id", "viewed_at");

-- AddForeignKey
ALTER TABLE "recently_viewed_masters" ADD CONSTRAINT "recently_viewed_masters_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed_masters" ADD CONSTRAINT "recently_viewed_masters_master_profile_id_fkey" FOREIGN KEY ("master_profile_id") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
