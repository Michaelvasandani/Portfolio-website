import { describe, expect, it, vi } from "vitest";

import { RawDeletionWorker, UploadIntentSweeper } from "./deletion";
import type { BlobUploadProvider } from "./service";
import { InMemoryCareerIngestionStore } from "./store";

function blobProvider(input: {
  state: BlobUploadProvider["deletionState"];
  remove: BlobUploadProvider["deleteRawBlob"];
}): BlobUploadProvider {
  return {
    issueClientUploadGrant: vi.fn(),
    deletionState: input.state,
    deleteRawBlob: input.remove,
  };
}

async function pendingDeletion(store: InMemoryCareerIngestionStore, now: Date) {
  await store.createIntent({
    id: "upload:one",
    filename: "resume.md",
    objectKey: "raw-career/upload:one/resume.md",
    declaredType: "text/markdown",
    size: 12,
    expectedHash: `sha256:${"a".repeat(64)}`,
    status: "processing",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  });
  await store.rejectAndEnqueueDeletion({
    intentId: "upload:one",
    blobKey: "raw-career/upload:one/resume.md",
    failureCode: "malformed-document",
    now,
    deletionDeadline: new Date(now.getTime() + 120_000),
  });
}

describe("raw Blob deletion reconciliation", () => {
  it("expires abandoned or partial client uploads into the same deletion outbox", async () => {
    const now = new Date("2026-08-12T19:00:00.000Z");
    const store = new InMemoryCareerIngestionStore();
    await store.createIntent({
      id: "upload:abandoned",
      filename: "resume.pdf",
      objectKey: "raw-career/upload:abandoned/resume.pdf",
      declaredType: "application/pdf",
      size: 1_024,
      expectedHash: `sha256:${"a".repeat(64)}`,
      status: "awaiting-upload",
      createdAt: new Date(now.getTime() - 600_000),
      expiresAt: new Date(now.getTime() - 1),
    });

    await expect(new UploadIntentSweeper({ store, now: () => now }).run()).resolves.toBe(1);
    expect(store.intent("upload:abandoned")).toMatchObject({
      status: "rejected",
      failureCode: "upload-intent-expired",
    });
    expect(store.deletionRecords()).toEqual([
      expect.objectContaining({
        intentId: "upload:abandoned",
        blobKey: "raw-career/upload:abandoned/resume.pdf",
        state: "pending",
      }),
    ]);
  });

  it("reads provider state before retry so an ambiguous applied deletion converges without duplication", async () => {
    let blobExists = true;
    const now = new Date("2026-08-12T19:00:00.000Z");
    const store = new InMemoryCareerIngestionStore();
    await pendingDeletion(store, now);
    const remove = vi.fn(async () => {
      blobExists = false;
      throw new Error("timeout after provider applied deletion");
    });
    const state = vi.fn(async () => (blobExists ? "present" as const : "absent" as const));
    const worker = new RawDeletionWorker({
      store,
      blob: blobProvider({ state, remove }),
      now: () => now,
    });

    await expect(worker.runOne()).resolves.toMatchObject({ state: "pending", attempts: 1 });
    now.setTime(now.getTime() + 10_000);
    await expect(worker.runOne()).resolves.toMatchObject({ state: "applied", attempts: 2 });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(state).toHaveBeenCalledTimes(2);
    expect(store.deletionRecords()[0]).toMatchObject({ state: "applied", providerReference: "already-absent" });
  });

  it("makes a deletion stuck and emits one idempotent notification after the bounded window", async () => {
    const now = new Date("2026-08-12T19:00:00.000Z");
    const store = new InMemoryCareerIngestionStore();
    await pendingDeletion(store, now);
    const remove = vi.fn().mockRejectedValue(new Error("provider unavailable with private detail"));
    const state = vi.fn().mockResolvedValue("present" as const);
    const worker = new RawDeletionWorker({
      store,
      blob: blobProvider({ state, remove }),
      now: () => now,
    });

    await worker.runOne();
    now.setTime(now.getTime() + 130_000);
    await expect(worker.runOne()).resolves.toMatchObject({ state: "stuck", failureCode: "deletion-window-exceeded" });
    await expect(worker.runOne()).resolves.toBeNull();

    expect(store.notifications()).toEqual([
      {
        idempotencyKey: "raw-deletion-stuck:deletion:one",
        kind: "stuck-raw-deletion",
        aggregateId: "deletion:one",
        state: "pending",
      },
    ]);
    expect(store.serializedState()).not.toContain("private detail");
  });
});
