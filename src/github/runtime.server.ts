import "server-only";

import { createGitHubIngestionRuntime } from "./runtime";

export function getGitHubIngestionRuntime() {
  return createGitHubIngestionRuntime({
    secret: process.env.GITHUB_INGESTION_SECRET,
    expectedRepository: process.env.GITHUB_INGESTION_REPOSITORY,
    expectedWorkflowRef: process.env.GITHUB_INGESTION_WORKFLOW_REF,
    // Ticket 02 has not provisioned Neon. Live ingestion must remain unavailable
    // until a durable, transactional GitHubIngestionStore adapter is injected.
    store: null,
  });
}
