BEGIN;

CREATE TABLE "schema_versions" (
  "version" integer PRIMARY KEY,
  "migration_hash" text NOT NULL UNIQUE,
  "installed_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "career_snapshots" (
  "id" text PRIMARY KEY,
  "schema_version" integer NOT NULL CONSTRAINT "career_snapshots_schema_version_v1" CHECK ("schema_version" = 1),
  "content_hash" text NOT NULL CONSTRAINT "career_snapshots_sha256" CHECK ("content_hash" ~ '^sha256:[a-f0-9]{64}$'),
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE TABLE "github_snapshots" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "presentation_policies" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "project_selection_states" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "evidence_packets" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "generated_outputs" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "publication_manifests" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "publication_runs" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "deployments" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "check_results" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "outbox_records" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "breaker_states" (LIKE "career_snapshots" INCLUDING ALL);

CREATE TABLE "audit_records" (LIKE "career_snapshots" INCLUDING ALL);

INSERT INTO "schema_versions" ("version", "migration_hash")
VALUES (1, '__MIGRATION_HASH__');

COMMIT;
