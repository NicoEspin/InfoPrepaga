ALTER TABLE "lead_import_batches" ADD COLUMN "alreadyRegistered" INTEGER;
ALTER TABLE "lead_import_rows"
  ADD COLUMN "sourceFingerprint" TEXT,
  ADD COLUMN "legacyFingerprints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
