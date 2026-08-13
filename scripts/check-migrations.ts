import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";

const manifestSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    migrations: z
      .array(
        z
          .object({
            file: z.string().regex(/^\d{4}_[a-z0-9_-]+\.sql$/),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const drizzleDirectory = new URL("../drizzle/", import.meta.url);
const rawManifest = JSON.parse(await readFile(new URL("manifest.json", drizzleDirectory), "utf8"));
const manifest = manifestSchema.parse(rawManifest);
const database = new PGlite();

for (const migration of manifest.migrations) {
  const migrationUrl = new URL(migration.file, drizzleDirectory);
  const source = await readFile(migrationUrl, "utf8");
  const actualHash = createHash("sha256").update(source).digest("hex");
  if (actualHash !== migration.sha256) {
    throw new Error(`Migration hash mismatch for ${migration.file}`);
  }
  await database.exec(source.replace("__MIGRATION_HASH__", migration.sha256));
}

const versionRows = await database.query<{ version: number; migration_hash: string }>(
  "SELECT version, migration_hash FROM schema_versions ORDER BY version",
);
if (versionRows.rows.length !== manifest.migrations.length || versionRows.rows.at(-1)?.version !== manifest.schemaVersion) {
  throw new Error("Installed schema version does not match the migration manifest");
}

const beforeFailure = await database.query<{ count: number }>("SELECT count(*)::int AS count FROM schema_versions");
let invalidMigrationFailed = false;
try {
  await database.exec("BEGIN; CREATE TABLE should_rollback (id integer); SELECT missing_column FROM should_rollback; COMMIT;");
} catch {
  invalidMigrationFailed = true;
  await database.exec("ROLLBACK;").catch(() => undefined);
}
if (!invalidMigrationFailed) {
  throw new Error("The intentionally invalid migration unexpectedly succeeded");
}
const rollbackTable = await database.query<{ name: string | null }>("SELECT to_regclass('should_rollback') AS name");
const afterFailure = await database.query<{ count: number }>("SELECT count(*)::int AS count FROM schema_versions");
if (rollbackTable.rows[0]?.name !== null || beforeFailure.rows[0]?.count !== afterFailure.rows[0]?.count) {
  throw new Error("A failed migration did not preserve the prior schema");
}

await database.close();
console.log(`Migration check passed: schema v${manifest.schemaVersion}, ${manifest.migrations.length} pinned migration, rollback preserved prior schema.`);
