import { collectGitHubSnapshot } from "../../src/github/collector";
import { GitHubHttpProvider } from "../../src/github/provider";
import {
  FileConditionalCache,
  buildGitHubDelivery,
  deliverGitHubEvidence,
} from "../../src/github/workflow-runtime";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing-required-environment:${name}`);
  return value;
}

const startedAt = new Date().toISOString();
const identity = {
  repository: required("GITHUB_REPOSITORY"),
  workflowRef: required("GITHUB_WORKFLOW_REF"),
  workflowSha: required("GITHUB_SHA"),
  runId: required("GITHUB_RUN_ID"),
  runAttempt: Number(required("GITHUB_RUN_ATTEMPT")),
};
const endpoint = required("GITHUB_INGESTION_ENDPOINT");
const secret = required("GITHUB_INGESTION_SECRET");

try {
  const snapshot = await collectGitHubSnapshot({
    owner: process.env.GITHUB_EVIDENCE_OWNER ?? identity.repository.split("/")[0] ?? "",
    provider: new GitHubHttpProvider({ token: required("GITHUB_TOKEN") }),
    cache: new FileConditionalCache(process.env.GITHUB_CONDITIONAL_CACHE ?? ".github-evidence-cache/conditional.json"),
  });
  const result = await deliverGitHubEvidence({
    endpoint,
    secret,
    delivery: buildGitHubDelivery({ ...identity, kind: "snapshot", payload: snapshot, sentAt: new Date().toISOString() }),
  });
  process.stdout.write(`${JSON.stringify({ outcome: "delivered", result, snapshotId: snapshot.id, contentHash: snapshot.contentHash, renderedContentHash: snapshot.renderedContentHash })}\n`);
} catch (error) {
  const failure = {
    startedAt,
    finishedAt: new Date().toISOString(),
    stage: "collect" as const,
    errorCode: error instanceof Error && error.message.startsWith("missing-required-environment:")
      ? "configuration-unavailable"
      : "github-collection-failed",
  };
  try {
    await deliverGitHubEvidence({
      endpoint,
      secret,
      delivery: buildGitHubDelivery({ ...identity, kind: "failure", payload: failure, sentAt: failure.finishedAt }),
    });
  } catch {
    // The workflow failure remains the durable observable signal when the private
    // receiver is also unavailable. Never log credential or provider detail.
  }
  process.stderr.write(`${JSON.stringify({ outcome: "failed", errorCode: failure.errorCode })}\n`);
  process.exitCode = 1;
}
