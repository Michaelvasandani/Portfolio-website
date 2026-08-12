import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { getTableName } from "drizzle-orm";

import { contractSchemas } from "../src/domain/contracts";
import * as databaseSchema from "../src/db/schema";

const expectedContracts = [
  "auditRecord",
  "breakerState",
  "careerSnapshot",
  "checkResult",
  "deployment",
  "evidencePacket",
  "generatedOutput",
  "githubSnapshot",
  "outboxRecord",
  "presentationPolicy",
  "projectSelectionState",
  "publicationManifest",
  "publicationRun",
];
const expectedTables = [
  "audit_records",
  "breaker_states",
  "career_snapshots",
  "check_results",
  "deployments",
  "evidence_packets",
  "generated_outputs",
  "github_snapshots",
  "outbox_records",
  "presentation_policies",
  "project_selection_states",
  "publication_manifests",
  "publication_runs",
  "schema_versions",
];

const actualContracts = Object.keys(contractSchemas).sort();
const actualTables = Object.values(databaseSchema).map(getTableName).sort();
if (JSON.stringify(actualContracts) !== JSON.stringify(expectedContracts)) {
  throw new Error(`Domain schema inventory differs: ${actualContracts.join(", ")}`);
}
if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
  throw new Error(`Database schema inventory differs: ${actualTables.join(", ")}`);
}

const sources = await Promise.all([
  readFile(new URL("../src/domain/contracts.ts", import.meta.url)),
  readFile(new URL("../src/db/schema.ts", import.meta.url)),
]);
const schemaHash = createHash("sha256");
for (const source of sources) schemaHash.update(source);

console.log(
  `Schema check passed: v1, ${actualContracts.length} domain contracts, ${actualTables.length} database tables, sha256:${schemaHash.digest("hex")}.`,
);
