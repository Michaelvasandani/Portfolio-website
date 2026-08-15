BEGIN;

ALTER TABLE "publication_manifests" DROP CONSTRAINT IF EXISTS "publication_manifests_schema_version_v1";
ALTER TABLE "publication_manifests" DROP CONSTRAINT IF EXISTS "publication_manifests_schema_version_check";
ALTER TABLE "publication_manifests" ADD CONSTRAINT "publication_manifests_schema_version_v2" CHECK ("schema_version" IN (1, 2));

INSERT INTO "schema_versions" ("version", "migration_hash")
VALUES (3, '__MIGRATION_HASH__');

COMMIT;
