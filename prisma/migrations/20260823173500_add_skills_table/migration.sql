-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "level" "SkillLevel" NOT NULL DEFAULT 'BEGINNER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mentee_profile_id" UUID,
    "mentor_profile_id" UUID,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_skills_name" ON "skills"("name");

-- CreateIndex
CREATE INDEX "idx_skills_mentee_profile" ON "skills"("mentee_profile_id");

-- CreateIndex
CREATE INDEX "idx_skills_mentor_profile" ON "skills"("mentor_profile_id");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_mentee_profile_id_fkey" FOREIGN KEY ("mentee_profile_id") REFERENCES "mentee_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_mentor_profile_id_fkey" FOREIGN KEY ("mentor_profile_id") REFERENCES "mentor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
