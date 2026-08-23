-- CreateTable
CREATE TABLE "mentee_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "avatar_url" VARCHAR(512),
    "headline" VARCHAR(255),
    "goals" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mentee_profiles_user_id_key" ON "mentee_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_mentee_profiles_user_id" ON "mentee_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "mentee_profiles" ADD CONSTRAINT "mentee_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
