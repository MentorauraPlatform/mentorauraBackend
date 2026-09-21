/*
  Warnings:

  - You are about to drop the column `level` on the `skills` table. All the data in the column will be lost.
  - You are about to drop the column `mentee_profile_id` on the `skills` table. All the data in the column will be lost.
  - You are about to drop the column `mentor_profile_id` on the `skills` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `skills` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('MENTEE', 'MENTOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "public"."OnboardingStatus" AS ENUM ('INCOMPLETE', 'PENDING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "public"."MentorshipStatus" AS ENUM ('INTRO', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MentorshipApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('MTN_MOMO', 'ORANGE_MONEY', 'CARD', 'BANK');

-- DropForeignKey
ALTER TABLE "public"."skills" DROP CONSTRAINT "skills_mentee_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."skills" DROP CONSTRAINT "skills_mentor_profile_id_fkey";

-- DropIndex
DROP INDEX "public"."idx_skills_mentee_profile";

-- DropIndex
DROP INDEX "public"."idx_skills_mentor_profile";

-- AlterTable
ALTER TABLE "public"."mentor_profiles" ADD COLUMN     "areas_of_expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "availability" JSONB,
ADD COLUMN     "experience" TEXT,
ADD COLUMN     "onboarding_status" TEXT NOT NULL DEFAULT 'INCOMPLETE';

-- AlterTable
ALTER TABLE "public"."mentorships" ALTER COLUMN "status" SET DEFAULT 'INTRO';

-- AlterTable
ALTER TABLE "public"."skills" DROP COLUMN "level",
DROP COLUMN "mentee_profile_id",
DROP COLUMN "mentor_profile_id";

-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "role",
ADD COLUMN     "email_verification_expires" TIMESTAMPTZ(6),
ADD COLUMN     "email_verification_token" VARCHAR(255),
ADD COLUMN     "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_mentor" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."user_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" "public"."SkillLevel" NOT NULL DEFAULT 'BEGINNER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mentorship_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mentee_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "message" TEXT,
    "status" "public"."MentorshipApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentorship_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_user_skills_user_id" ON "public"."user_skills"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_skills_skill_id" ON "public"."user_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_skill" ON "public"."user_skills"("user_id", "skill_id");

-- CreateIndex
CREATE INDEX "idx_applications_mentee" ON "public"."mentorship_applications"("mentee_id");

-- CreateIndex
CREATE INDEX "idx_applications_mentor" ON "public"."mentorship_applications"("mentor_id");

-- CreateIndex
CREATE INDEX "idx_applications_plan" ON "public"."mentorship_applications"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "public"."skills"("name");

-- AddForeignKey
ALTER TABLE "public"."user_skills" ADD CONSTRAINT "user_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."user_skills" ADD CONSTRAINT "user_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."mentorship_applications" ADD CONSTRAINT "mentorship_applications_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."mentorship_applications" ADD CONSTRAINT "mentorship_applications_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."mentorship_applications" ADD CONSTRAINT "mentorship_applications_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
