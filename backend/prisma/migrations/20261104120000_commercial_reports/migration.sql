-- No historical sales are inferred. Existing leads begin tracking at deployment.
CREATE TYPE "CommercialStage" AS ENUM ('NEW','CONTACTED','FOLLOW_UP','PROPOSAL','CLOSED');
ALTER TABLE leads ADD COLUMN "commercialStage" "CommercialStage" NOT NULL DEFAULT 'NEW',
 ADD COLUMN "commercialStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "entrySourceId" TEXT REFERENCES lead_sources(id) ON DELETE RESTRICT;
-- Previous edits record the field names, not their old values. Only unchanged origins are provable.
UPDATE leads l SET "entrySourceId" = "sourceId" WHERE NOT EXISTS (
 SELECT 1 FROM lead_activities a WHERE a."leadId"=l.id AND a.kind='edited'
 AND a.detail->'fields' ? 'sourceId');
CREATE TABLE commercial_movements (
 id TEXT PRIMARY KEY, "leadId" TEXT NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
 "from" "CommercialStage" NOT NULL, "to" "CommercialStage" NOT NULL,
 "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "responsibleId" TEXT REFERENCES users(id) ON DELETE RESTRICT,
 "sourceId" TEXT NOT NULL REFERENCES lead_sources(id) ON DELETE RESTRICT,
 "actorId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 reason TEXT, "leadVersion" INTEGER NOT NULL,
 CONSTRAINT commercial_movement_change CHECK ("from" <> "to"),
 CONSTRAINT commercial_movement_correction CHECK ("from" <> 'CLOSED' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
);
CREATE UNIQUE INDEX "commercial_movements_leadId_leadVersion_key" ON commercial_movements("leadId","leadVersion");
CREATE INDEX "commercial_movements_leadId_effectiveAt_leadVersion_idx" ON commercial_movements("leadId","effectiveAt","leadVersion");
CREATE INDEX "commercial_movements_to_effectiveAt_sourceId_responsibleId_idx" ON commercial_movements("to","effectiveAt","sourceId","responsibleId");
CREATE INDEX reports_lead_creation ON leads("createdAt", "entrySourceId");
CREATE INDEX reports_assignment_history ON lead_activities("leadId", "createdAt", id) WHERE kind='assigned';
CREATE TABLE commercial_reports (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, "authorId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "operationKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, snapshot JSONB NOT NULL
);
CREATE UNIQUE INDEX "commercial_reports_authorId_operationKey_key" ON commercial_reports("authorId","operationKey");
CREATE INDEX "commercial_reports_generatedAt_id_idx" ON commercial_reports("generatedAt",id);
-- Enforce immutable snapshots for application and accidental direct SQL updates.
CREATE FUNCTION prevent_commercial_report_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Commercial reports are immutable'; END; $$;
CREATE TRIGGER immutable_commercial_reports BEFORE UPDATE OR DELETE ON commercial_reports
 FOR EACH ROW EXECUTE FUNCTION prevent_commercial_report_change();
