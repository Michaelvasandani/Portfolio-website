import { describe, expect, it } from "vitest";

import { canonicalJson, sha256 } from "./canonical";
import {
  calculateGitHubSnapshotContentHash,
  calculateGitHubSnapshotEvidenceHash,
  calculateGitHubSnapshotRenderedHash,
} from "./collector";
import { githubEvidenceEndpoints, type GitHubSnapshotIdentity } from "./snapshot-contract";
import { signGitHubDelivery } from "./delivery";
import {
  GitHubDeliveryReceiver,
  InMemoryGitHubIngestionStore,
  type GitHubDelivery,
} from "./receiver";

const secret = "test-only-ingestion-secret-at-least-32-bytes";
const now = new Date("2026-08-12T10:00:00.000Z");

function snapshot() {
  const normalized: Omit<GitHubSnapshotIdentity, "collectionStatus"> = {
    owner: { login: "michael", numericId: "7" },
    pinOrder: ["repository:R_one"],
    repositories: [{
      id: "repository:R_one",
      nodeId: "R_one",
      name: "one",
      nameWithOwner: "michael/one",
      url: "https://github.com/michael/one",
      description: "One repository",
      homepageUrl: null,
      visibility: "public" as const,
      pinPosition: 1,
      archived: false,
      disabled: false,
      fork: false,
      defaultBranch: "main",
      topics: ["agents"],
      languages: [{ name: "TypeScript", bytes: 10 }],
      releases: [],
      meaningfulActivityAt: "2026-08-11T09:00:00.000Z",
      documents: [{
        id: "evidence:R_one-readme",
        kind: "readme" as const,
        path: "README.md",
        sourceUrl: "https://github.com/michael/one/blob/main/README.md",
        sourceContent: "# One\n",
        sourceHash: sha256("# One\n"),
        renderedContent: "# One\n",
        renderedHash: sha256("# One\n"),
      }],
      sourceStructure: [{ path: "src/index.ts", type: "blob", objectHash: "tree-sha", size: 10 }],
      fetchOutcomes: githubEvidenceEndpoints.map((endpoint) => ({
        endpoint,
        required: endpoint !== "releases",
        status: "success" as const,
        fetchedAt: "2026-08-12T09:55:00.000Z",
        httpStatus: 200,
        attempts: 1,
      })),
      sourceUrls: ["https://github.com/michael/one", "https://github.com/michael/one/blob/main/README.md"],
    }],
  };
  const identity = { ...normalized, collectionStatus: "complete" as const };
  const contentHash = calculateGitHubSnapshotContentHash(identity);
  return {
    schemaVersion: 1 as const,
    id: `github:${contentHash.slice(7)}`,
    contentHash,
    evidenceHash: calculateGitHubSnapshotEvidenceHash(identity),
    renderedContentHash: calculateGitHubSnapshotRenderedHash(identity),
    createdAt: "2026-08-12T09:55:00.000Z",
    collectedAt: "2026-08-12T09:55:00.000Z",
    ...identity,
  };
}

function delivery(overrides: Partial<GitHubDelivery> = {}): GitHubDelivery {
  const payload = snapshot();
  return {
    schemaVersion: 1,
    kind: "snapshot",
    deliveryId: "github-delivery:12345.1",
    repository: "michael/portfolio",
    workflowRef: "michael/portfolio/.github/workflows/collect-github-evidence.yml@refs/heads/main",
    workflowSha: "a".repeat(40),
    runId: "12345",
    runAttempt: 1,
    sentAt: "2026-08-12T09:59:00.000Z",
    payloadHash: sha256(canonicalJson(payload)),
    payload,
    ...overrides,
  } as GitHubDelivery;
}

function signed(value: GitHubDelivery) {
  const rawBody = canonicalJson(value);
  return { rawBody, signature: signGitHubDelivery(rawBody, secret) };
}

function receiver(store = new InMemoryGitHubIngestionStore()) {
  return {
    store,
    value: new GitHubDeliveryReceiver({
      store,
      secret,
      expectedRepository: "michael/portfolio",
      expectedWorkflowRef: "michael/portfolio/.github/workflows/collect-github-evidence.yml@refs/heads/main",
      replayWindowMs: 5 * 60_000,
      maxPayloadBytes: 1_000_000,
      now: () => now,
    }),
  };
}

describe("signed GitHub delivery receiver", () => {
  it("installs an immutable snapshot and treats its duplicate hash as success", async () => {
    const runtime = receiver();
    const first = await runtime.value.receive(signed(delivery()));
    const duplicate = delivery({ deliveryId: "github-delivery:12346.1", runId: "12346" });
    const second = await runtime.value.receive(signed(duplicate));

    expect(first).toEqual({ status: "installed", snapshotId: snapshot().id });
    expect(second).toEqual({ status: "duplicate", snapshotId: snapshot().id });
    expect(runtime.store.latestSnapshot()?.id).toBe(snapshot().id);
    expect(runtime.store.snapshotCount()).toBe(1);
  });

  it.each([
    ["tampered signature", (request: ReturnType<typeof signed>) => ({ ...request, signature: `sha256:${"0".repeat(64)}` }), "invalid-signature"],
    ["wrong repository", () => signed(delivery({ repository: "attacker/repository" })), "unexpected-identity"],
    ["wrong workflow", () => signed(delivery({ workflowRef: "michael/portfolio/.github/workflows/other.yml@refs/heads/main" })), "unexpected-identity"],
    ["stale payload", () => signed(delivery({ sentAt: "2026-08-12T09:00:00.000Z" })), "stale-delivery"],
    ["unknown schema", () => signed(delivery({ schemaVersion: 2 as 1 })), "unknown-schema"],
    ["mismatched hash", () => signed(delivery({ payloadHash: `sha256:${"f".repeat(64)}` })), "hash-mismatch"],
  ])("rejects and audits %s", async (_label, requestFactory, reason) => {
    const runtime = receiver();
    const request = typeof requestFactory === "function" ? requestFactory(signed(delivery())) : requestFactory;

    await expect(runtime.value.receive(request)).rejects.toMatchObject({ reason });
    expect(runtime.store.auditEvents.at(-1)).toMatchObject({ outcome: "rejected", reason });
    expect(runtime.store.snapshotCount()).toBe(0);
  });

  it("rejects oversized bodies before parsing and preserves the latest snapshot", async () => {
    const runtime = receiver();
    await runtime.value.receive(signed(delivery()));

    await expect(runtime.value.receive({ rawBody: "x".repeat(1_000_001), signature: "sha256:invalid" })).rejects.toMatchObject({ reason: "payload-too-large" });
    expect(runtime.store.latestSnapshot()?.id).toBe(snapshot().id);
    expect(runtime.store.snapshotCount()).toBe(1);
  });

  it("rejects replayed delivery identity with different content", async () => {
    const runtime = receiver();
    const original = delivery();
    await runtime.value.receive(signed(original));
    const current = snapshot();
    const identity = {
      owner: current.owner,
      pinOrder: current.pinOrder,
      repositories: current.repositories.map((repository) => ({ ...repository, description: "Changed description" })),
      collectionStatus: "complete" as const,
    };
    const contentHash = calculateGitHubSnapshotContentHash(identity);
    const changedPayload = {
      ...current,
      ...identity,
      id: `github:${contentHash.slice(7)}`,
      contentHash,
      evidenceHash: calculateGitHubSnapshotEvidenceHash(identity),
      renderedContentHash: calculateGitHubSnapshotRenderedHash(identity),
    };
    const replay = delivery({ payload: changedPayload, payloadHash: sha256(canonicalJson(changedPayload)) } as Partial<GitHubDelivery>);

    await expect(runtime.value.receive(signed(replay))).rejects.toMatchObject({ reason: "replayed-delivery" });
    expect(runtime.store.snapshotCount()).toBe(1);
  });

  it.each([
    ["unknown repository field", (value: ReturnType<typeof snapshot>) => ({ ...value, repositories: [{ ...value.repositories[0], unexpected: true }] })],
    ["missing repository name", (value: ReturnType<typeof snapshot>) => {
      const repository = { ...value.repositories[0] } as Record<string, unknown>;
      delete repository.name;
      return { ...value, repositories: [repository] };
    }],
    ["unsafe source URL", (value: ReturnType<typeof snapshot>) => ({ ...value, repositories: [{ ...value.repositories[0], sourceUrls: ["http://github.com/michael/one"] }] })],
    ["malformed fetch outcome", (value: ReturnType<typeof snapshot>) => ({ ...value, repositories: [{ ...value.repositories[0], fetchOutcomes: [{ endpoint: "topics", required: true, status: "unknown" }] }] })],
  ])("rejects signed malformed snapshot shape: %s", async (_label, mutate) => {
    const runtime = receiver();
    const payload = mutate(snapshot());
    const malformed = delivery({ payload, payloadHash: sha256(canonicalJson(payload)) } as Partial<GitHubDelivery>);

    await expect(runtime.value.receive(signed(malformed))).rejects.toMatchObject({ reason: "invalid-snapshot" });
    expect(runtime.store.snapshotCount()).toBe(0);
  });

  it("rejects a signed partial snapshot and preserves the prior valid snapshot", async () => {
    const runtime = receiver();
    await runtime.value.receive(signed(delivery()));
    const current = snapshot();
    const repositories = current.repositories.map((repository) => ({
      ...repository,
      fetchOutcomes: repository.fetchOutcomes.map((outcome) =>
        outcome.endpoint === "topics"
          ? { ...outcome, status: "failed" as const, httpStatus: 503, attempts: 3, errorCode: "github-unavailable" }
          : outcome,
      ),
    }));
    const identity = { owner: current.owner, pinOrder: current.pinOrder, repositories, collectionStatus: "partial" as const };
    const contentHash = calculateGitHubSnapshotContentHash(identity);
    const partial = {
      ...current,
      ...identity,
      id: `github:${contentHash.slice(7)}`,
      contentHash,
      evidenceHash: calculateGitHubSnapshotEvidenceHash(identity),
      renderedContentHash: calculateGitHubSnapshotRenderedHash(identity),
    };
    const incomplete = delivery({
      deliveryId: "github-delivery:12349.1",
      runId: "12349",
      payload: partial,
      payloadHash: sha256(canonicalJson(partial)),
    } as Partial<GitHubDelivery>);

    await expect(runtime.value.receive(signed(incomplete))).rejects.toMatchObject({ reason: "incomplete-snapshot" });
    expect(runtime.store.latestSnapshot()?.id).toBe(snapshot().id);
    expect(runtime.store.snapshotCount()).toBe(1);
  });

  it("records signed collection failures without replacing the prior snapshot", async () => {
    const runtime = receiver();
    await runtime.value.receive(signed(delivery()));
    const failurePayload = {
      startedAt: "2026-08-12T09:58:00.000Z",
      finishedAt: "2026-08-12T09:59:00.000Z",
      stage: "collect",
      errorCode: "github-unavailable",
    };
    const failure = delivery({
      kind: "failure",
      deliveryId: "github-delivery:12347.1",
      runId: "12347",
      payload: failurePayload,
      payloadHash: sha256(canonicalJson(failurePayload)),
    } as Partial<GitHubDelivery>);

    expect(await runtime.value.receive(signed(failure))).toEqual({ status: "failure-recorded" });
    expect(runtime.store.latestSnapshot()?.id).toBe(snapshot().id);
    expect(runtime.store.collectionAttempts.at(-1)).toMatchObject({ outcome: "failed", errorCode: "github-unavailable" });
  });
});
