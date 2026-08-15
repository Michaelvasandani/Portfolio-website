import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const immutableColumns = () => ({
  id: text().primaryKey(),
  schemaVersion: integer("schema_version").notNull(),
  contentHash: text("content_hash").notNull(),
  payload: jsonb().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

const versionedTable = (name: string) =>
  pgTable(
    name,
    immutableColumns(),
    (table) => [
      check(`${name}_schema_version_v1`, sql`${table.schemaVersion} = 1`),
      check(`${name}_sha256`, sql`${table.contentHash} ~ '^sha256:[a-f0-9]{64}$'`),
    ],
  );

export const schemaVersions = pgTable("schema_versions", {
  version: integer().primaryKey(),
  migrationHash: text("migration_hash").notNull().unique(),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const careerSnapshots = versionedTable("career_snapshots");
export const githubSnapshots = versionedTable("github_snapshots");
export const presentationPolicies = versionedTable("presentation_policies");
export const projectSelectionStates = versionedTable("project_selection_states");
export const evidencePackets = versionedTable("evidence_packets");
export const generatedOutputs = versionedTable("generated_outputs");
export const publicationManifests = pgTable(
  "publication_manifests",
  immutableColumns(),
  (table) => [
    check("publication_manifests_schema_version_v2", sql`${table.schemaVersion} in (1, 2)`),
    check("publication_manifests_sha256", sql`${table.contentHash} ~ '^sha256:[a-f0-9]{64}$'`),
  ],
);
export const publicationRuns = versionedTable("publication_runs");
export const deployments = versionedTable("deployments");
export const checkResults = versionedTable("check_results");
export const outboxRecords = versionedTable("outbox_records");
export const notificationRecords = versionedTable("notification_records");
export const breakerStates = versionedTable("breaker_states");
export const auditRecords = versionedTable("audit_records");
