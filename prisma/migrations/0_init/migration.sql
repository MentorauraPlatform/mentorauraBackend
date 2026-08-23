-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'MENTEE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "company" VARCHAR(255),
    "bio" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mentor_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "price_amount" BIGINT NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'XAF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mentee_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentorships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mentorship_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "mentee_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "status" VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
    "meeting_link" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mentorship_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'XAF',
    "provider" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "provider_reference" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mentorship_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "mentor_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_profiles_user_id_key" ON "mentor_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_mentor_profiles_user_id" ON "mentor_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_plans_mentor_id" ON "plans"("mentor_id");

-- CreateIndex
CREATE INDEX "idx_mentorships_mentee" ON "mentorships"("mentee_id");

-- CreateIndex
CREATE INDEX "idx_mentorships_mentor" ON "mentorships"("mentor_id");

-- CreateIndex
CREATE INDEX "idx_sessions_mentorship" ON "sessions"("mentorship_id");

-- CreateIndex
CREATE INDEX "idx_sessions_scheduled_at" ON "sessions"("scheduled_at");

-- CreateIndex
CREATE INDEX "idx_payments_mentorship" ON "payments"("mentorship_id");

-- CreateIndex
CREATE INDEX "idx_payments_provider_ref" ON "payments"("provider_reference");

-- CreateIndex
CREATE INDEX "idx_reviews_mentor" ON "reviews"("mentor_id");

-- AddForeignKey
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentor_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentor_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mentorship_id_fkey" FOREIGN KEY ("mentorship_id") REFERENCES "mentorships"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_mentorship_id_fkey" FOREIGN KEY ("mentorship_id") REFERENCES "mentorships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "mentor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_mentorship_id_fkey" FOREIGN KEY ("mentorship_id") REFERENCES "mentorships"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

