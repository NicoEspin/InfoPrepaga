ALTER TABLE "leads" ADD COLUMN "emailKey" TEXT,
 ADD COLUMN "phoneKey" TEXT,
 ADD COLUMN "contactKeysVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "importData" JSONB;
-- Existing contacts are backfilled with the same versioned application normalizer
-- under the commercial lock before the first preview. New writes start at v1.
ALTER TABLE "leads" ALTER COLUMN "contactKeysVersion" SET DEFAULT 1;
CREATE INDEX "leads_emailKey_idx" ON "leads"("emailKey");
CREATE INDEX "leads_phoneKey_idx" ON "leads"("phoneKey");

CREATE TABLE "lead_import_batches" (
 "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "fileName" TEXT NOT NULL, "sheets" TEXT[] NOT NULL, "warnings" TEXT[] NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'REVIEW',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3),
 "total" INTEGER NOT NULL, "imported" INTEGER NOT NULL DEFAULT 0, "omitted" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "lead_import_batches_ownerId_createdAt_idx" ON "lead_import_batches"("ownerId", "createdAt");
CREATE INDEX "lead_import_batches_expiresAt_status_idx" ON "lead_import_batches"("expiresAt", "status");
CREATE TABLE "lead_import_rows" (
 "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL REFERENCES "lead_import_batches"("id") ON DELETE CASCADE,
 "sheet" TEXT NOT NULL, "rowNumber" INTEGER NOT NULL, "group" TEXT NOT NULL,
 "name" TEXT NOT NULL, "nameCandidates" TEXT[] NOT NULL, "nameResolved" BOOLEAN NOT NULL, "formulaFields" TEXT[] NOT NULL,
 "email" TEXT NOT NULL, "phone" TEXT NOT NULL, "observations" TEXT NOT NULL,
 "metadata" JSONB NOT NULL, "advisor" TEXT NOT NULL,
 "sourceId" TEXT, "assignedToId" TEXT, "assignmentResolved" BOOLEAN NOT NULL DEFAULT false,
 "decision" TEXT NOT NULL DEFAULT 'AUTO', "reviewedMatches" TEXT[] NOT NULL,
 "leadId" TEXT REFERENCES "leads"("id") ON DELETE RESTRICT,
 CONSTRAINT "lead_import_row_decision" CHECK ("decision" IN ('AUTO','INCLUDE','OMIT'))
);
CREATE UNIQUE INDEX "lead_import_rows_leadId_key" ON "lead_import_rows"("leadId");
CREATE UNIQUE INDEX "lead_import_rows_batchId_sheet_rowNumber_key" ON "lead_import_rows"("batchId","sheet","rowNumber");
CREATE INDEX "lead_import_rows_batchId_sheet_rowNumber_idx" ON "lead_import_rows"("batchId","sheet","rowNumber");
