CREATE TABLE lead_import_configurations (
 id TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 fingerprint TEXT NOT NULL, configuration JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "lead_import_configurations_ownerId_fingerprint_key" UNIQUE ("ownerId",fingerprint)
);
