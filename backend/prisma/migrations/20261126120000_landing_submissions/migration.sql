CREATE TABLE "landing_submissions" (
  "id" TEXT NOT NULL,
  "landing" VARCHAR(32) NOT NULL,
  "submissionId" VARCHAR(36) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "controllerId" VARCHAR(100) NOT NULL,
  "formId" VARCHAR(16) NOT NULL,
  "privacyVersion" VARCHAR(64) NOT NULL,
  "consent" BOOLEAN NOT NULL CHECK ("consent" = true),
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "leadId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  CONSTRAINT "landing_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "landing_submissions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "landing_submissions_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "landing_submissions_landing_submissionId_key" ON "landing_submissions"("landing", "submissionId");
CREATE INDEX "landing_submissions_leadId_receivedAt_idx" ON "landing_submissions"("leadId", "receivedAt");
CREATE INDEX "landing_submissions_sourceId_receivedAt_idx" ON "landing_submissions"("sourceId", "receivedAt");
-- Reuse LANDING_IP / LANDING_CM from the existing commercial migration.
