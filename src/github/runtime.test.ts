import { describe, expect, it } from "vitest";

import { createGitHubIngestionRuntime } from "./runtime";

describe("GitHub ingestion runtime", () => {
  it("fails closed without a durable managed-store adapter", () => {
    expect(createGitHubIngestionRuntime({
      secret: "configured-secret-at-least-32-characters",
      expectedRepository: "michael/portfolio",
      expectedWorkflowRef: "michael/portfolio/.github/workflows/collect-github-evidence.yml@refs/heads/main",
      store: null,
    })).toEqual({ status: "unavailable" });
  });
});
