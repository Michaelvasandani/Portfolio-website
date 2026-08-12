import { resolve } from "node:path";

import {
  collectTextArtifacts,
  exitCodeForReport,
  listRepositoryFiles,
  parseCliArguments,
  readJsonDocument,
  renderVerificationReport,
  relativizeArtifactPaths,
} from "../src/provisioning/cli";
import {
  validateProvisioningManifest,
  verifyProvisioning,
  type ConnectionProbe,
  type ProvisioningManifest,
} from "../src/provisioning/verify";

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const arguments_ = parseCliArguments(process.argv.slice(2));
  const manifestDocument = await readJsonDocument(resolve(repositoryRoot, arguments_.manifestPath));
  const manifestErrors = validateProvisioningManifest(manifestDocument);
  if (manifestErrors.some((error) => /does not match schema/i.test(error))) {
    throw new Error(manifestErrors.join("; "));
  }
  const probesDocument = await readJsonDocument(resolve(repositoryRoot, arguments_.probesPath));
  if (!Array.isArray(probesDocument)) throw new Error("probe evidence must be a JSON array");

  const repositoryFiles = await listRepositoryFiles(repositoryRoot);
  const repositoryArtifacts = relativizeArtifactPaths(
    await collectTextArtifacts(repositoryFiles),
    repositoryRoot,
  );
  const publicBundleArtifacts = relativizeArtifactPaths(
    await collectTextArtifacts([resolve(repositoryRoot, arguments_.publicDirectory)]),
    repositoryRoot,
  );
  const report = verifyProvisioning({
    manifest: manifestDocument as ProvisioningManifest,
    probes: probesDocument as ConnectionProbe[],
    repositoryArtifacts,
    publicBundleArtifacts,
  });
  process.stdout.write(`${renderVerificationReport(report)}\n`);
  process.exitCode = exitCodeForReport(report);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown provisioning verification failure";
  process.stderr.write(`Provisioning verification failed closed: ${message}\n`);
  process.exitCode = 1;
});
