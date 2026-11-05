-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'NO_ANSWER', 'WHATSAPP', 'OVER_BUDGET', 'MEDICAL_PREEXISTENCE', 'RETIRED', 'PROSPECT', 'OTHER_INTEREST', 'ALREADY_CONTRACTED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "receivesLeads" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "observations" TEXT NOT NULL DEFAULT '',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "sourceId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_tasks" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "ownerId" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "completedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_state" (
    "id" INTEGER NOT NULL,
    "lastUserId" TEXT,
    "lastUserCreated" TIMESTAMP(3),

    CONSTRAINT "assignment_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_code_key" ON "lead_sources"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_name_key" ON "lead_sources"("name");

-- CreateIndex
CREATE INDEX "leads_assignedToId_createdAt_id_idx" ON "leads"("assignedToId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_sourceId_idx" ON "leads"("sourceId");

-- CreateIndex
CREATE INDEX "lead_notes_leadId_createdAt_idx" ON "lead_notes"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_activities_leadId_createdAt_id_idx" ON "lead_activities"("leadId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "commercial_tasks_ownerId_dueAt_idx" ON "commercial_tasks"("ownerId", "dueAt");

-- CreateIndex
CREATE INDEX "commercial_tasks_leadId_dueAt_idx" ON "commercial_tasks"("leadId", "dueAt");

-- CreateIndex
CREATE INDEX "commercial_tasks_completedAt_idx" ON "commercial_tasks"("completedAt");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The lock row must exist before API or worker starts. No account/data seed is run.
INSERT INTO "assignment_state" ("id") VALUES (1);
INSERT INTO "lead_sources" ("id", "code", "name") VALUES
  (gen_random_uuid()::text, 'LANDING_IP', 'Landing IP'),
  (gen_random_uuid()::text, 'LANDING_CM', 'Landing CM'),
  (gen_random_uuid()::text, 'WHATSAPP_CM', 'Whatsapp CM'),
  (gen_random_uuid()::text, 'META_1', 'Meta 1'),
  (gen_random_uuid()::text, 'META_2', 'Meta 2'),
  (gen_random_uuid()::text, 'META_3', 'Meta 3');
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "task_duration_allowed" CHECK ("duration" IN (30, 60, 90));
ALTER TABLE "leads" ADD CONSTRAINT "lead_version_positive" CHECK ("version" > 0);
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "task_version_positive" CHECK ("version" > 0);
