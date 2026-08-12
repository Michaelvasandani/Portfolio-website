import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson, sha256 } from "./canonical";
import {
  calculateGitHubSnapshotContentHash,
  calculateGitHubSnapshotEvidenceHash,
  calculateGitHubSnapshotRenderedHash,
} from "./collector";
import { verifyGitHubDeliverySignature } from "./delivery";
import {
  FileConditionalCache,
  buildGitHubDelivery,
  deliverGitHubEvidence,
} from "./workflow-runtime";

const cleanup: string[] = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("GitHub workflow runtime", () => {
  it("persists conditional representations without credential material", async () => {
    const directory = await mkdtemp(join(tmpdir(), "portfolio-github-cache-"));
    cleanup.push(directory);
    const path = join(directory, "conditional.json");
    const cache = new FileConditionalCache(path);
    await cache.set("repository:readme", { etag: '"v1"', body: { content: "public evidence" } });

    expect(await new FileConditionalCache(path).get("repository:readme")).toEqual({
      etag: '"v1"',
      body: { content: "public evidence" },
    });
    expect(await readFile(path, "utf8")).not.toMatch(/token|secret|authorization/i);
  });

  it("binds the run and workflow identity into a signed content-addressed delivery", () => {
    const payload = { evidence: "public" };
    const delivery = buildGitHubDelivery({
      kind: "failure",
      payload,
      repository: "michael/portfolio",
      workflowRef: "michael/portfolio/.github/workflows/collect-github-evidence.yml@refs/heads/main",
      workflowSha: "a".repeat(40),
      runId: "123",
      runAttempt: 2,
      sentAt: "2026-08-12T10:00:00.000Z",
    });

    expect(delivery.deliveryId).toBe("github-delivery:123.2");
    expect(delivery.payloadHash).toBe(sha256(canonicalJson(payload)));
  });

  it("rejects malformed run identity before building a delivery", () => {
    expect(() => buildGitHubDelivery({
      kind: "failure",
      payload: { errorCode: "failed" },
      repository: "not-a-repository",
      workflowRef: "workflow",
      workflowSha: "not-a-sha",
      runId: "not-a-run",
      runAttempt: 0,
      sentAt: "not-a-time",
    })).toThrow(/run identity/i);
  });

  it("refuses to build a snapshot delivery with incomplete required evidence", () => {
    const identity = {
      owner: { login: "michael", numericId: "7" },
      pinOrder: [],
      repositories: [],
      collectionStatus: "partial" as const,
    };
    const contentHash = calculateGitHubSnapshotContentHash(identity);
    const payload = {
      schemaVersion: 1 as const,
      id: `github:${contentHash.slice(7)}`,
      contentHash,
      evidenceHash: calculateGitHubSnapshotEvidenceHash(identity),
      renderedContentHash: calculateGitHubSnapshotRenderedHash(identity),
      createdAt: "2026-08-12T10:00:00.000Z",
      collectedAt: "2026-08-12T10:00:00.000Z",
      ...identity,
    };

    expect(() => buildGitHubDelivery({
      kind: "snapshot",
      payload,
      repository: "michael/portfolio",
      workflowRef: "workflow",
      workflowSha: "a".repeat(40),
      runId: "123",
      runAttempt: 1,
      sentAt: "2026-08-12T10:00:00.000Z",
    })).toThrow(/incomplete snapshot/i);
  });

  it("signs the exact request body and bounds delivery retries", async () => {
    let attempts = 0;
    const secret = "test-only-ingestion-secret-at-least-32-bytes";
    const result = await deliverGitHubEvidence({
      endpoint: "https://control.example.com/api/ingestion/github",
      secret,
      delivery: buildGitHubDelivery({
        kind: "failure",
        payload: {
          startedAt: "2026-08-12T09:59:00.000Z",
          finishedAt: "2026-08-12T10:00:00.000Z",
          stage: "collect",
          errorCode: "github-unavailable",
        },
        repository: "michael/portfolio",
        workflowRef: "workflow",
        workflowSha: "a".repeat(40),
        runId: "123",
        runAttempt: 1,
        sentAt: "2026-08-12T10:00:00.000Z",
      }),
      fetch: async (request) => {
        attempts += 1;
        const rawBody = await request.text();
        expect(verifyGitHubDeliverySignature(rawBody, request.headers.get("x-portfolio-signature") ?? "", secret)).toBe(true);
        return attempts < 3 ? new Response("unavailable", { status: 503 }) : Response.json({ status: "failure-recorded" });
      },
      wait: async () => undefined,
    });

    expect(attempts).toBe(3);
    expect(result).toEqual({ status: "failure-recorded" });
  });
});
