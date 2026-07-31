-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "client_profile_id" UUID NOT NULL,
    "master_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorites_master_profile_id_idx" ON "favorites"("master_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_client_profile_id_master_profile_id_key" ON "favorites"("client_profile_id", "master_profile_id");

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_master_profile_id_fkey" FOREIGN KEY ("master_profile_id") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
