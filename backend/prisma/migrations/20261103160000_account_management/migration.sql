DO $$ BEGIN
 IF EXISTS (SELECT u.id FROM users u LEFT JOIN user_roles ur ON ur."userId"=u.id LEFT JOIN roles r ON r.id=ur."roleId" GROUP BY u.id HAVING count(ur."roleId") <> 1 OR bool_or(r.name NOT IN ('ADMIN','VENDEDOR'))) THEN
 RAISE EXCEPTION 'Incompatible account roles: review accounts before account_management migration';
 END IF;
 IF EXISTS (SELECT lower(trim(email)) FROM users GROUP BY lower(trim(email)) HAVING count(*) > 1) THEN
 RAISE EXCEPTION 'Duplicate normalized account emails: review accounts before migration';
 END IF;
END $$;
ALTER TABLE users ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
UPDATE users SET email=lower(trim(email));
CREATE UNIQUE INDEX user_roles_one_role ON user_roles("userId");
CREATE TABLE account_audit (
 id TEXT PRIMARY KEY, "actorId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "targetId" TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 kind TEXT NOT NULL, detail JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX account_audit_target ON account_audit("targetId", "createdAt");
