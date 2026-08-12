import { describe, expect, it, vi } from "vitest";

import { CareerIngestionMaintenance } from "./maintenance";
import type { BlobUploadProvider } from "./service";
import { InMemoryCareerIngestionStore } from "./store";

describe("executable ingestion maintenance seam", () => {
  it("sweeps abandoned uploads, reconciles deletion, and exposes stuck/notification state", async () => {
    const now = new Date("2026-08-12T19:00:00.000Z");
    const store = new InMemoryCareerIngestionStore();
    await store.createIntent({
      id: "upload:abandoned",
      filename: "resume.md",
      objectKey: "raw-career/upload:abandoned/resume.md",
      declaredType: "text/markdown",
      size: 10,
      expectedHash: `sha256:${"a".repeat(64)}`,
      status: "awaiting-upload",
      createdAt: new Date(now.getTime() - 1_000_000),
      expiresAt: new Date(now.getTime() - 1),
    });
    const blob: BlobUploadProvider = {
      issueClientUploadGrant: vi.fn(),
      deletionState: vi.fn().mockResolvedValue("present"),
      deleteRawBlob: vi.fn().mockRejectedValue(new Error("private provider detail")),
    };
    const maintenance = new CareerIngestionMaintenance({ store, blob, now: () => now });

    await expect(maintenance.run()).resolves.toMatchObject({ expiredIntents: 1, deletionState: "pending" });
    now.setTime(now.getTime() + 16 * 60 * 1_000);
    await expect(maintenance.run()).resolves.toMatchObject({ deletionState: "stuck" });
    await expect(maintenance.status()).resolves.toEqual({
      pending: 0,
      leased: 0,
      applied: 0,
      stuck: 1,
      pendingNotifications: 1,
    });
  });
});
