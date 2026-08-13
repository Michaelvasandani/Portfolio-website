BEGIN;

CREATE TABLE "notification_records" (LIKE "career_snapshots" INCLUDING ALL);

INSERT INTO "schema_versions" ("version", "migration_hash")
VALUES (2, '__MIGRATION_HASH__');

COMMIT;
