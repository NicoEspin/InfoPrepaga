-- Bounded legacy backfill; partial index is not representable in Prisma 6.
CREATE INDEX "leads_contact_keys_pending_idx" ON "leads" ("id") WHERE "contactKeysVersion" = 0;

-- CreateEnum
CREATE TYPE "YCloudInboundStatus" AS ENUM ('PENDING', 'PROCESSED', 'IGNORED', 'REVIEW', 'EXHAUSTED');

-- CreateTable
CREATE TABLE "ycloud_inbound_events" (
    "id" VARCHAR(160) NOT NULL,
    "messageId" VARCHAR(160),
    "wamid" VARCHAR(256),
    "eventType" VARCHAR(100) NOT NULL,
    "apiVersion" VARCHAR(32) NOT NULL,
    "wabaId" VARCHAR(64),
    "businessPhone" VARCHAR(32),
    "messageType" VARCHAR(40),
    "phoneKey" VARCHAR(32),
    "profileName" VARCHAR(160),
    "externalUserId" VARCHAR(160),
    "emittedAt" TIMESTAMPTZ(3) NOT NULL,
    "messageAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attribution" JSONB,
    "status" "YCloudInboundStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" VARCHAR(64),
    "processedAt" TIMESTAMPTZ(3),
    "leadId" TEXT,

    CONSTRAINT "ycloud_inbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ycloud_inbound_retries" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousStatus" "YCloudInboundStatus" NOT NULL,
    "previousErrorCode" TEXT,
    "previousAttempts" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ycloud_inbound_retries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ycloud_inbound_events_status_nextAttemptAt_receivedAt_id_idx" ON "ycloud_inbound_events"("status", "nextAttemptAt", "receivedAt", "id");

-- CreateIndex
CREATE INDEX "ycloud_inbound_events_phoneKey_idx" ON "ycloud_inbound_events"("phoneKey");

-- CreateIndex
CREATE INDEX "ycloud_inbound_events_leadId_idx" ON "ycloud_inbound_events"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ycloud_inbound_events_wabaId_messageId_key" ON "ycloud_inbound_events"("wabaId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ycloud_inbound_events_wabaId_wamid_key" ON "ycloud_inbound_events"("wabaId", "wamid");

-- CreateIndex
CREATE INDEX "ycloud_inbound_retries_eventId_createdAt_idx" ON "ycloud_inbound_retries"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ycloud_inbound_retries_actorId_idx" ON "ycloud_inbound_retries"("actorId");

-- AddForeignKey
ALTER TABLE "ycloud_inbound_events" ADD CONSTRAINT "ycloud_inbound_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ycloud_inbound_retries" ADD CONSTRAINT "ycloud_inbound_retries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ycloud_inbound_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ycloud_inbound_retries" ADD CONSTRAINT "ycloud_inbound_retries_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
