import { describe, expect, it } from "vitest";

import { canonicalJson, sha256 } from "./canonical";
import {
  calculateGitHubSnapshotContentHash,
  calculateGitHubSnapshotEvidenceHash,
  calculateGitHubSnapshotRenderedHash,
} from "./collector";
import { signGitHubDelivery } from "./delivery";
import { GitHubIngestionHttpController } from "./http";
import { GitHubDeliveryReceiver, InMemoryGitHubIngestionStore } from "./receiver";

const secret = "test-only-ingestion-secret-at-least-32-bytes";

describe("GitHub ingestion HTTP boundary", () => {
  it("fails closed with a generic response when no durable store is connected", async () => {
    const controller = new GitHubIngestionHttpController(() => ({ status: "unavailable" }));
    const response = await controller.post(
      new Request("https://portfolio.example.com/api/ingestion/github", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("maps verified duplicate deliveries to an idempotent 200 response", async () => {
    const now = new Date("2026-08-12T10:00:00.000Z");
    const identity = {
      owner: { login: "michael", numericId: "7" },
      pinOrder: [],
      repositories: [],
      collectionStatus: "complete" as const,
    };
    const contentHash = calculateGitHubSnapshotContentHash(identity);
    const payload = {
      schemaVersion: 1,
      id: `github:${contentHash.slice(7)}`,
      contentHash,
      evidenceHash: calculateGitHubSnapshotEvidenceHash(identity),
      renderedContentHash: calculateGitHubSnapshotRenderedHash(identity),
      createdAt: now.toISOString(),
      collectedAt: now.toISOString(),
      ...identity,
    };
    const delivery = {
      schemaVersion: 1,
      kind: "snapshot",
      deliveryId: "github-delivery:1.1",
      repository: "michael/portfolio",
      workflowRef: "michael/portfolio/.github/workflows/collect-github-evidence.yml@refs/heads/main",
      workflowSha: "a".repeat(40),
      runId: "1",
      runAttempt: 1,
      sentAt: now.toISOString(),
      payloadHash: sha256(canonicalJson(payload)),
      payload,
    };
    const rawBody = canonicalJson(delivery);
    const receiver = new GitHubDeliveryReceiver({
      store: new InMemoryGitHubIngestionStore(),
      secret,
      expectedRepository: delivery.repository,
      expectedWorkflowRef: delivery.workflowRef,
      replayWindowMs: 300_000,
      maxPayloadBytes: 1_000_000,
      now: () => now,
    });
    const controller = new GitHubIngestionHttpController(() => ({ status: "ready", receiver }));
    const request = () => new Request("https://portfolio.example.com/api/ingestion/github", {
      method: "POST",
      headers: { "content-type": "application/json", "x-portfolio-signature": signGitHubDelivery(rawBody, secret) },
      body: rawBody,
    });

    expect((await controller.post(request())).status).toBe(201);
    const duplicateDelivery = { ...delivery, deliveryId: "github-delivery:2.1", runId: "2" };
    const duplicateBody = canonicalJson(duplicateDelivery);
    const duplicateResponse = await controller.post(new Request(request().url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-portfolio-signature": signGitHubDelivery(duplicateBody, secret) },
      body: duplicateBody,
    }));
    expect(duplicateResponse.status).toBe(200);
    expect(await duplicateResponse.json()).toMatchObject({ status: "duplicate" });
  });

  it("returns only a stable rejection reason and never echoes the payload", async () => {
    const store = new InMemoryGitHubIngestionStore();
    const receiver = new GitHubDeliveryReceiver({
      store,
      secret,
      expectedRepository: "michael/portfolio",
      expectedWorkflowRef: "expected",
      replayWindowMs: 300_000,
      maxPayloadBytes: 10,
    });
    const controller = new GitHubIngestionHttpController(() => ({ status: "ready", receiver }));
    const response = await controller.post(new Request("https://portfolio.example.com/api/ingestion/github", {
      method: "POST",
      headers: { "content-type": "application/json", "x-portfolio-signature": "sha256:secret-value" },
      body: "private payload contents",
    }));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe('{"status":"rejected","reason":"payload-too-large"}');
  });

  it("requires an application/json content type before reading the body", async () => {
    const controller = new GitHubIngestionHttpController(() => ({ status: "unavailable" }));
    const response = await controller.post(new Request("https://portfolio.example.com/api/ingestion/github", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "private payload",
    }));

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ status: "rejected", reason: "unsupported-media-type" });
  });

  it("stops reading a chunked body as soon as the actual byte cap is exceeded", async () => {
    let chunksRead = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksRead += 1;
        controller.enqueue(new TextEncoder().encode("123456"));
        if (chunksRead === 3) controller.close();
      },
    }, { highWaterMark: 0 });
    const controller = new GitHubIngestionHttpController(
      () => ({ status: "unavailable" }),
      { maxBodyBytes: 10, bodyReadTimeoutMs: 100 },
    );
    const response = await controller.post(new Request("https://portfolio.example.com/api/ingestion/github", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ status: "rejected", reason: "payload-too-large" });
    expect(chunksRead).toBe(2);
  });

  it("times out a stalled request body", async () => {
    const body = new ReadableStream<Uint8Array>({ pull() {} });
    const controller = new GitHubIngestionHttpController(
      () => ({ status: "unavailable" }),
      { maxBodyBytes: 10, bodyReadTimeoutMs: 5 },
    );
    const response = await controller.post(new Request("https://portfolio.example.com/api/ingestion/github", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit));

    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({ status: "rejected", reason: "body-timeout" });
  });
});
