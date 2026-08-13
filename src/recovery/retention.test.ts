import { describe, expect, it } from "vitest";

import {
  InMemoryRetentionCleaner,
  InMemoryRetentionLedger,
  RetentionManager,
  planRetention,
  type RetentionRecord,
} from "./retention";

const day = 86_400_000;
const now = new Date("2026-08-12T22:00:00.000Z");

describe("recovery retention", () => {
  it("preserves the latest 20 restorable Valid deployments and every transitive dependency", () => {
    const records: RetentionRecord[] = [];
    for (let index = 0; index < 22; index += 1) {
      const deploymentId = `deployment:${String(index).padStart(2, "0")}`;
      const careerId = index === 0 || index === 21 ? "career:shared" : `career:${index}`;
      records.push({ id: deploymentId, kind: "valid-deployment", createdAt: new Date(now.getTime() - (21 - index) * day).toISOString(), dependencies: [`manifest:${index}`, careerId] });
      records.push({ id: `manifest:${index}`, kind: "manifest", createdAt: new Date(now.getTime() - (21 - index) * day).toISOString(), dependencies: [`check:${index}`] });
      records.push({ id: `check:${index}`, kind: "check-outcome", createdAt: new Date(now.getTime() - (21 - index) * day).toISOString(), dependencies: [] });
      if (!records.some(({ id }) => id === careerId)) records.push({ id: careerId, kind: "career-snapshot", createdAt: new Date(now.getTime() - 400 * day).toISOString(), dependencies: [] });
    }

    const plan = planRetention(records, now);

    expect(plan.preserved.filter(({ kind }) => kind === "valid-deployment")).toHaveLength(20);
    expect(plan.deleted.map(({ id }) => id)).toContain("deployment:00");
    expect(plan.deleted.map(({ id }) => id)).toContain("deployment:01");
    expect(plan.deleted.map(({ id }) => id)).not.toContain("career:shared");
    expect(plan.blockedDependencyIds).toEqual([]);
  });

  it("keeps compact audits for one year and bulky rejected/quarantined diagnostics for 30 days", () => {
    const records: RetentionRecord[] = [
      { id: "audit:fresh", kind: "compact-audit", createdAt: new Date(now.getTime() - 364 * day).toISOString(), dependencies: [] },
      { id: "audit:old", kind: "compact-audit", createdAt: new Date(now.getTime() - 366 * day).toISOString(), dependencies: [] },
      { id: "diagnostic:fresh", kind: "bulky-diagnostic", lifecycle: "quarantined", createdAt: new Date(now.getTime() - 29 * day).toISOString(), dependencies: [] },
      { id: "diagnostic:old", kind: "bulky-diagnostic", lifecycle: "rejected", createdAt: new Date(now.getTime() - 31 * day).toISOString(), dependencies: [] },
    ];

    const plan = planRetention(records, now);
    expect(plan.preserved.map(({ id }) => id)).toEqual(["audit:fresh", "diagnostic:fresh"]);
    expect(plan.deleted.map(({ id }) => id)).toEqual(["audit:old", "diagnostic:old"]);
  });

  it("records a cleanup outbox intent, reconciles ambiguity, and reapplies the same plan idempotently", async () => {
    const records: RetentionRecord[] = [
      { id: "audit:old", kind: "compact-audit", createdAt: new Date(now.getTime() - 366 * day).toISOString(), dependencies: [] },
    ];
    const ledger = new InMemoryRetentionLedger();
    const cleaner = new InMemoryRetentionCleaner({ ambiguousResponses: 1 });
    const manager = new RetentionManager({ ledger, cleaner });
    const plan = planRetention(records, now);

    const first = await manager.apply(plan, now);
    const second = await manager.apply(plan, new Date(now.getTime() + day));

    expect(first).toMatchObject({ outcome: "applied", deletedCount: 1 });
    expect(second).toEqual(first);
    expect(cleaner.applications).toEqual([{ idempotencyKey: plan.idempotencyKey, recordIds: ["audit:old"] }]);
    expect((await ledger.snapshot())).toEqual([expect.objectContaining({ state: "applied", providerReference: expect.stringMatching(/^cleanup:/) })]);
  });
});
