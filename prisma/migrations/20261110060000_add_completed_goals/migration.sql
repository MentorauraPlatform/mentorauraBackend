-- AlterTable
ALTER TABLE "public"."mentee_profiles" ADD COLUMN IF NOT EXISTS "completed_goals" TEXT[] DEFAULT ARRAY[]::TEXT[];
