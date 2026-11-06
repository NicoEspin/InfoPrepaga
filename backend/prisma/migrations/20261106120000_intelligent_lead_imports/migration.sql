ALTER TABLE "lead_import_batches"
  ADD COLUMN "created" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updated" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "merged" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "excluded" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "lead_import_rows_leadId_key";
ALTER TABLE "lead_import_rows" ADD COLUMN "outcome" TEXT;
UPDATE "lead_import_rows" SET "outcome" = 'CREATE' WHERE "leadId" IS NOT NULL;
UPDATE "lead_import_batches" SET "created" = "imported";
CREATE TABLE "lead_import_mappings" (
  "kind" TEXT NOT NULL, "scope" TEXT NOT NULL, "key" TEXT NOT NULL,
  "sourceId" TEXT, "assignedToId" TEXT, "confirmedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_import_mappings_pkey" PRIMARY KEY ("kind", "scope", "key"),
  CONSTRAINT "lead_import_mapping_source" FOREIGN KEY ("sourceId") REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lead_import_mapping_seller" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lead_import_mapping_author" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "lead_import_appearances" (
  "id" TEXT NOT NULL PRIMARY KEY, "fingerprint" TEXT NOT NULL UNIQUE,
  "leadId" TEXT NOT NULL REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "batchId" TEXT NOT NULL REFERENCES "lead_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "fileName" TEXT NOT NULL, "sheet" TEXT NOT NULL, "rowNumber" INTEGER NOT NULL,
  "sourceId" TEXT NOT NULL REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "original" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "lead_import_appearances_leadId_createdAt_idx" ON "lead_import_appearances"("leadId", "createdAt");
CREATE INDEX "lead_import_appearances_batchId_idx" ON "lead_import_appearances"("batchId");
CREATE INDEX "lead_import_rows_leadId_idx" ON "lead_import_rows"("leadId");
