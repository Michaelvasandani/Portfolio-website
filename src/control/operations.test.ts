import { describe, expect, it } from "vitest";

import { sha256 } from "../github/canonical";
import type { RecoverySnapshot } from "../recovery/service";
import { operationalSections, RecordedOperationalControls, RecordedOperationalRepository, UnavailableOperationalRepository } from "./operations";

describe("operational shell", () => {
  it("inventories every planned operational entity", () => {
    expect(operationalSections.map(({ slug }) => slug)).toEqual([
      "upload",
      "publication-runs",
      "deployments",
      "checks",
      "served-version",
      "breaker",
      "restore-retry",
      "source-freshness",
      "raw-deletion",
      "outbox",
      "notifications",
      "retention",
      "backup",
      "operator-timeline",
    ]);
  });

  it("reports an explicit unavailable state instead of fabricating operational success", async () => {
    const repository = new UnavailableOperationalRepository("Managed control-plane persistence is not connected.");

    for (const section of operationalSections) {
      await expect(repository.read(section.slug)).resolves.toEqual({
        slug: section.slug,
        label: section.label,
        state: "unavailable",
        summary: "Managed control-plane persistence is not connected.",
        records: [],
      });
    }
  });

  it("projects recorded private recovery and continued-operation state", async () => {
    const recovery: RecoverySnapshot = {
      servedDeploymentId: "deployment:prior",
      deployments: [{
        id: "deployment:prior",
        providerDeploymentId: "provider:prior",
        state: "valid",
        precedingValidDeploymentId: null,
        candidateHash: sha256("candidate"),
        manifestHash: sha256("manifest"),
        publicOutputHash: sha256("output"),
        careerSnapshotId: "career:one",
        createdAt: "2026-08-12T20:00:00.000Z",
      }],
      breaker: { state: "open", failingDeploymentId: "deployment:failed", reason: "immediate:manifest-hash", openedAt: "2026-08-12T22:00:00.000Z", clearedAt: null },
      incidents: [],
      outbox: [{ id: "outbox:rollback", incidentId: "recovery:failed", effect: "rollback", idempotencyKey: "rollback:recovery:failed", state: "applied", attempts: 1, leaseOwner: null, leaseExpiresAt: null, providerReference: "route:prior" }],
      notifications: [{ id: "notification:rollback", incidentId: "recovery:failed", kind: "automatic-rollback", idempotencyKey: "notification:rollback", state: "pending", providerMessageId: null, createdAt: "2026-08-12T22:00:01.000Z", subject: "Portfolio restored", details: "Prior Valid deployment served.", manualSteps: [] }],
    };
    const repository = new RecordedOperationalRepository({
      recovery: async () => recovery,
      publicationRuns: async () => [{ id: "run:one", phase: "verifying-production", terminal: "failed" }],
      sourceFreshness: async () => [{ source: "github", snapshotId: "github:one", collectedAt: "2026-08-12T20:00:00.000Z", state: "fresh" }],
      rawDeletion: async () => [{ id: "deletion:one", state: "pending" }],
      retention: async () => ({ preserved: 20, deleted: 2, lastAppliedAt: "2026-08-12T21:00:00.000Z" }),
      backup: async () => ({ state: "healthy", checkedAt: "2026-08-12T21:00:00.000Z", pointInTimeRecovery: true }),
    });

    await expect(repository.read("served-version")).resolves.toMatchObject({ state: "available", records: expect.arrayContaining([
      { label: "Deployment", value: "deployment:prior" },
      { label: "Manifest hash", value: sha256("manifest") },
      { label: "Public output hash", value: sha256("output") },
    ]) });
    await expect(repository.read("breaker")).resolves.toMatchObject({ records: expect.arrayContaining([{ label: "State", value: "open" }]) });
    await expect(repository.read("outbox")).resolves.toMatchObject({ records: expect.arrayContaining([{ label: "rollback:recovery:failed", value: "applied" }]) });
    await expect(repository.read("notifications")).resolves.toMatchObject({ records: expect.arrayContaining([{ label: "automatic-rollback", value: "pending" }]) });
    await expect(repository.read("retention")).resolves.toMatchObject({ records: expect.arrayContaining([{ label: "Restorable Valid deployments", value: "20" }]) });
    await expect(repository.read("backup")).resolves.toMatchObject({ records: expect.arrayContaining([{ label: "Point-in-time recovery", value: "configured" }]) });
  });

  it("routes explicit owner commands to retry and recovery ports without inventing success", async () => {
    const commands: string[] = [];
    const controls = new RecordedOperationalControls({
      retry: async (runId) => { commands.push(`retry:${runId}`); return { operationId: `retry:${runId}` }; },
      restore: async (deploymentId, reason, actor) => { commands.push(`restore:${deploymentId}:${reason}:${actor}`); return { operationId: `restore:${deploymentId}` }; },
      clearBreaker: async () => { commands.push("clear-breaker"); return { operationId: "breaker:clear" }; },
    });

    await expect(controls.execute({ action: "retry", targetId: "run:one", reason: "", actor: "owner" })).resolves.toEqual({ outcome: "accepted", operationId: "retry:run:one" });
    await expect(controls.execute({ action: "restore", targetId: "deployment:prior", reason: "Owner-approved restore", actor: "owner" })).resolves.toEqual({ outcome: "accepted", operationId: "restore:deployment:prior" });
    await expect(controls.execute({ action: "clear-breaker", targetId: null, reason: "", actor: "owner" })).resolves.toEqual({ outcome: "accepted", operationId: "breaker:clear" });
    expect(commands).toEqual(["retry:run:one", "restore:deployment:prior:Owner-approved restore:owner", "clear-breaker"]);
    await expect(controls.execute({ action: "restore", targetId: null, reason: "missing target", actor: "owner" })).rejects.toThrow("operational-command-target-required");
  });
});
