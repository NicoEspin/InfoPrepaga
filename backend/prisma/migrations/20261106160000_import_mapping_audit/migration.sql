CREATE TABLE "lead_import_mapping_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "lead_import_mapping_events_createdAt_id_idx" ON "lead_import_mapping_events"("createdAt", "id");
