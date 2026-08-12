import { mkdirSync, writeFileSync } from "node:fs";

import { createFixtureMatrix, createPositiveFixture } from "../../src/publication-checks/fixtures";
import { collectLocalPublicationEvidence } from "../../src/publication-checks/local-harness";
import { NORMATIVE_CONFIG_HASH } from "../../src/publication-checks/config";
import { runPublicationChecks } from "../../src/publication-checks/runner";
import type { PublicationChecker } from "../../src/publication-checks/contracts";

const outputDirectory = "evidence/ticket-08";
mkdirSync(outputDirectory, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(`${outputDirectory}/${name}`, `${JSON.stringify(value, null, 2)}\n`);

const positive = await collectLocalPublicationEvidence();
const localRun = await runPublicationChecks(positive.target, positive.configuration, positive.checkers, positive.clock);
const positiveRun = await runPublicationChecks(createPositiveFixture().target, positive.configuration, positive.checkers, positive.clock);
if (positiveRun.outcome !== "passed") throw new Error("Positive publication contract fixture did not pass.");
if (localRun.checks.find(({ checkerId }) => checkerId === "candidate-identity")?.outcome !== "blocked") {
  throw new Error("The current renderer fixture was incorrectly accepted as the composed candidate preview.");
}

const fixtureResults = [];
for (const entry of createFixtureMatrix()) {
  const result = await runPublicationChecks(entry.fixture.target, entry.fixture.configuration, entry.fixture.checkers, entry.fixture.clock);
  const check = result.checks.find(({ checkerId }) => checkerId === entry.checkId)!;
  if (check.outcome !== entry.expected) throw new Error(`${entry.requirement}/${entry.name} expected ${entry.expected}, received ${check.outcome}.`);
  fixtureResults.push({ requirement: entry.requirement, name: entry.name, checkerId: entry.checkId, expected: entry.expected, actual: check.outcome, measurements: check.measurements });
}

const crashed: PublicationChecker = {
  definition: positive.inventory[0]!,
  createAttempt: () => ({ run: async () => { throw new Error("fixture crash"); } }),
};
const retryRun = await runPublicationChecks(
  positive.target,
  positive.configuration,
  [crashed, ...positive.checkers.slice(1)],
  positive.clock,
);
const retryEvidence = retryRun.checks[0]!;
if (retryEvidence.attempts.length !== 3 || retryEvidence.outcome !== "blocked") throw new Error("Fail-closed retry demonstration failed.");

write("requirement-check-inventory.json", positive.inventory);
write("positive-run.json", positiveRun);
write("local-artifact-run.json", localRun);
write("local-collector-execution.json", positive.collection);
write("positive-negative-fixture-matrix.json", fixtureResults);
write("retry-fail-closed.json", retryEvidence);
write("pinned-environment-manifest.json", {
  normativeConfigurationHash: NORMATIVE_CONFIG_HASH,
  environment: positive.configuration.environment,
  viewports: positive.configuration.viewports,
  accessibility: positive.configuration.accessibility,
  lighthouse: positive.configuration.lighthouse,
  thresholds: positive.configuration.thresholds,
  retry: positive.configuration.retry,
});
write("evidence-retention-manifest.json", {
  evidenceSchemaVersion: 1,
  mandatoryCheckFields: ["checkIdentity", "checkerId", "checkerVersion", "ruleset", "configurationHash", "target", "targetIdentity", "startedAt", "finishedAt", "outcome", "classification", "integrity", "measurements", "attempts", "reportPointer", "retentionClass"],
  compactAuditDays: positive.configuration.retention.compactDays,
  bulkyRejectedAndQuarantinedDays: positive.configuration.retention.bulkyRejectedDays,
  reproducibilityMaterialForLatestValidDeployments: positive.configuration.retention.restorableValidDeployments,
});
write("external-acceptance-blockers.json", {
  generatedAt: positive.clock.now(),
  blockers: [{
    requirement: "PUB-003",
    acceptanceCheck: "Run the full suite against a production-shaped, provider-created, zero-traffic immutable deployment.",
    status: "blocked",
    reason: "The current public routes render the Approved-renderer fixture rather than ticket 07's immutable candidate, ticket 09 has not yet provided the candidate-package deployment adapter, ticket 02 remains open, and no Vercel project or scoped control credential is available.",
    notClaimed: ["live provider deployment identity", "live preview URL", "provider-observed public-output hash"],
  }],
  availableInheritedEvidence: {
    approvedRendererManualAccessibility: "evidence/ticket-03.md#human-approval",
    pinnedPdfUaReports: "evidence/ticket-03/verapdf-ua1-*.json",
  },
});

process.stdout.write(`Publication-check contracts passed ${positiveRun.checks.length} positive checks and ${fixtureResults.length} negative/warning fixtures; live zero-traffic provider acceptance remains blocked on provisioning.\n`);
