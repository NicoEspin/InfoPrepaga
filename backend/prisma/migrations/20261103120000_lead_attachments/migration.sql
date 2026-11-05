CREATE TABLE "lead_attachments" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'UPLOADING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_attachments_size_check" CHECK ("size" > 0 AND "size" <= 10485760),
  CONSTRAINT "lead_attachments_state_check" CHECK ("state" IN ('UPLOADING', 'READY', 'DELETING')),
  CONSTRAINT "lead_attachments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "lead_attachments_objectKey_key" ON "lead_attachments"("objectKey");
CREATE INDEX "lead_attachments_leadId_createdAt_id_idx" ON "lead_attachments"("leadId", "createdAt", "id");
