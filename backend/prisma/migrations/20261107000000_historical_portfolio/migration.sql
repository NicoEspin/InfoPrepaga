-- Existing leads retain daily visibility and their current allocation policy.
CREATE TYPE "PortfolioClass" AS ENUM ('ACTIVE', 'HISTORICAL', 'UNCLASSIFIED');
CREATE TYPE "LeadIntakeMode" AS ENUM ('NEW', 'HISTORICAL');
ALTER TABLE leads ADD COLUMN "portfolioClass" "PortfolioClass" NOT NULL DEFAULT 'ACTIVE',
 ADD COLUMN "intakeMode" "LeadIntakeMode" NOT NULL DEFAULT 'NEW',
 ADD COLUMN "autoAssignmentEligible" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "originDate" DATE, ADD COLUMN "declaredLastManagedAt" DATE;
ALTER TABLE lead_import_batches ADD COLUMN mode "LeadIntakeMode" NOT NULL DEFAULT 'NEW', ADD COLUMN configuration JSONB;
CREATE INDEX "leads_portfolioClass_assignedToId_createdAt_id_idx" ON leads("portfolioClass", "assignedToId", "createdAt", id);
CREATE INDEX "leads_autoAssignmentEligible_portfolioClass_assignedToId_idx" ON leads("autoAssignmentEligible", "portfolioClass", "assignedToId");

