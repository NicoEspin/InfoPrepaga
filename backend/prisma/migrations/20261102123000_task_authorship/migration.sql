-- Preserve creation authorship independently of the mutable task owner.
-- Existing tasks, if any, remain unknown; do not invent a historical author.
ALTER TABLE "commercial_tasks" ADD COLUMN "createdById" TEXT;
ALTER TABLE "commercial_tasks" ADD CONSTRAINT "commercial_tasks_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
