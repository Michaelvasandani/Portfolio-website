import { describe, expect, it } from "vitest";

import { sha256 } from "../github/canonical";
import { ManualPublicationClock } from "../publication/clock";
import {
  FailClosedRecoveryProvider,
  InMemoryRecoveryProvider,
  InMemoryRecoveryStore,
  ManualRestoreCoordinator,
  RecoveryCoordinator,
  classifyObjectiveFailure,
} from "./service";
import { ProductionAdapterUnavailableError } from "../publication/contracts";

const observation = (
  deploymentId: string,
  kind: "manifest-hash" | "deployment-hash" | "critical-content" | "runtime" | "performance" | "external-link",
  probeIdentity: string,
  observedAt = "2026-08-12T22:00:00.000Z",
) => ({
  deploymentId,
  kind,
  probeIdentity,
  observedAt,
  check: {
    checkerId: `recovery:${kind}`,
    checkerVersion: "1.0.0",
    configurationHash: sha256("recovery-configuration"),
    target: deploymentId,
    startedAt: observedAt,
    finishedAt: observedAt,
    outcome: "failed" as const,
    measurements: { objectiveFailure: true },
    retryHistory: [] as string[],
    reportPointer: `memory://recovery-observation/${probeIdentity}`,
  },
});

const deployment = (id: string, state: "valid" | "quarantined" = "valid") => ({
  id,
  providerDeploymentId: `provider:${id}`,
  state,
  precedingValidDeploymentId: null,
  candidateHash: sha256(`candidate:${id}`),
  manifestHash: sha256(`manifest:${id}`),
  publicOutputHash: sha256(`output:${id}`),
  careerSnapshotId: `career:${id}`,
  createdAt: "2026-08-12T20:00:00.000Z",
});

describe("objective production failure policy", () => {
  it("triggers immediately for wrong hashes and confirmed critical content", () => {
    for (const kind of ["manifest-hash", "deployment-hash", "critical-content"] as const) {
      expect(classifyObjectiveFailure([observation("deployment:new", kind, `probe:${kind}`)])).toEqual({
        trigger: "immediate",
        kind,
        evidenceCount: 1,
      });
    }
  });

  it("requires three independent consecutive smoke failures spanning two minutes", () => {
    const observations = [0, 60_000, 120_000].map((offset, index) => observation(
      "deployment:new", "runtime", `clean-environment:${index}`, new Date(Date.parse("2026-08-12T22:00:00.000Z") + offset).toISOString(),
    ));

    expect(classifyObjectiveFailure(observations.slice(0, 2))).toBeNull();
    expect(classifyObjectiveFailure([...observations.slice(0, 2), { ...observations[2]!, probeIdentity: observations[1]!.probeIdentity }])).toBeNull();
    expect(classifyObjectiveFailure(observations)).toEqual({ trigger: "confirmed-smoke", kind: "runtime", evidenceCount: 3 });
    expect(classifyObjectiveFailure([{ ...observations[0]!, kind: "performance" }])).toBeNull();
    expect(classifyObjectiveFailure([{ ...observations[0]!, kind: "external-link" }])).toBeNull();
  });
});

describe("recovery coordinator", () => {
  it("fails closed when live routing and recovery checks are unavailable", async () => {
    const provider = new FailClosedRecoveryProvider();
    await expect(provider.readRouting()).rejects.toBeInstanceOf(ProductionAdapterUnavailableError);
    await expect(provider.route({ idempotencyKey: "rollback:one", providerDeploymentId: "provider:prior" })).rejects.toBeInstanceOf(ProductionAdapterUnavailableError);
    await expect(provider.verify(deployment("deployment:prior"))).rejects.toBeInstanceOf(ProductionAdapterUnavailableError);
  });

  it("routes once to the recorded prior Valid, verifies, quarantines, opens the breaker, and records one notification", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const failed = { ...deployment("deployment:failed"), precedingValidDeploymentId: prior.id };
    const store = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const provider = new InMemoryRecoveryProvider({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const coordinator = new RecoveryCoordinator({ store, provider, clock });
    const observations = [observation(failed.id, "manifest-hash", "probe:hash", clock.now().toISOString())];

    const first = await coordinator.recover(observations);
    const duplicate = await coordinator.recover(observations);
    const state = await store.snapshot();

    expect(first.status).toBe("recovered");
    expect(duplicate.id).toBe(first.id);
    expect(provider.routeChanges).toEqual([{ idempotencyKey: `rollback:${first.id}`, providerDeploymentId: prior.providerDeploymentId }]);
    expect(provider.verifications).toHaveLength(1);
    expect(state.servedDeploymentId).toBe(prior.id);
    expect(state.deployments.find(({ id }) => id === failed.id)?.state).toBe("quarantined");
    expect(state.breaker).toMatchObject({ state: "open", failingDeploymentId: failed.id });
    expect(state.notifications).toEqual([expect.objectContaining({ kind: "automatic-rollback", state: "pending" })]);
    expect(state.outbox.filter(({ effect }) => effect === "rollback")).toHaveLength(1);
    expect(first.timeline.map(({ event }) => event)).toEqual([
      "objective-failure-confirmed", "breaker-opened", "rollback-intent-recorded", "provider-routing-observed", "recovery-checks-passed", "failed-deployment-quarantined", "notification-recorded",
    ]);
    expect(first.verification?.check).toMatchObject({
      checkerId: "recovery-identity-and-smoke",
      checkerVersion: "1.0.0",
      rulesHash: expect.stringMatching(/^sha256:/),
      environment: { runner: "in-memory", image: "local-recovery-v1", cleanEnvironmentId: expect.any(String) },
      target: prior.id,
      outcome: "passed",
      measurements: expect.any(Object),
      retryHistory: [],
    });
  });

  it("fails closed when recovery evidence is stale or not pinned to the restored deployment", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const failed = { ...deployment("deployment:failed"), precedingValidDeploymentId: prior.id };
    const store = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const provider = new InMemoryRecoveryProvider({
      deployments: [prior, failed],
      servedDeploymentId: failed.id,
      verificationEvidence: {
        target: failed.id,
        startedAt: new Date(clock.now().getTime() - 600_000).toISOString(),
        finishedAt: new Date(clock.now().getTime() - 600_000).toISOString(),
      },
    });

    const incident = await new RecoveryCoordinator({ store, provider, clock }).recover([
      observation(failed.id, "manifest-hash", "probe:hash", clock.now().toISOString()),
    ]);

    expect(incident).toMatchObject({ status: "escalated", verification: { check: { target: failed.id } } });
    expect(incident.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "recovery-checks-failed", details: expect.objectContaining({ reason: "recovery-evidence-invalid" }) }),
    ]));
  });

  it("fails closed when recovery evidence exceeds two clean-environment retries", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const failed = { ...deployment("deployment:failed"), precedingValidDeploymentId: prior.id };
    const store = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const provider = new InMemoryRecoveryProvider({
      deployments: [prior, failed],
      servedDeploymentId: failed.id,
      verificationEvidence: { retryHistory: ["clean:one", "clean:two", "clean:three"] },
    });

    await expect(new RecoveryCoordinator({ store, provider, clock }).recover([
      observation(failed.id, "manifest-hash", "probe:hash", clock.now().toISOString()),
    ])).resolves.toMatchObject({ status: "escalated" });
  });

  it("reconciles an ambiguous route response by provider read without a second route change", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const failed = { ...deployment("deployment:failed"), precedingValidDeploymentId: prior.id };
    const store = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const provider = new InMemoryRecoveryProvider({ deployments: [prior, failed], servedDeploymentId: failed.id, ambiguousRouteResponses: 1 });
    const coordinator = new RecoveryCoordinator({ store, provider, clock });

    const incident = await coordinator.recover([observation(failed.id, "critical-content", "probe:critical", clock.now().toISOString())]);

    expect(incident.status).toBe("recovered");
    expect(provider.routeChanges).toHaveLength(1);
    expect(provider.routingReads).toBeGreaterThanOrEqual(1);
  });

  it("escalates failed verification without retry or oscillation and leaves observed provider state authoritative", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const failed = { ...deployment("deployment:failed"), precedingValidDeploymentId: prior.id };
    const store = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const provider = new InMemoryRecoveryProvider({ deployments: [prior, failed], servedDeploymentId: failed.id, verificationOutcome: "failed" });
    const coordinator = new RecoveryCoordinator({ store, provider, clock });
    const observations = [observation(failed.id, "deployment-hash", "probe:hash", clock.now().toISOString())];

    const incident = await coordinator.recover(observations);
    const duplicate = await coordinator.recover(observations);
    const state = await store.snapshot();

    expect(incident.status).toBe("escalated");
    expect(duplicate.status).toBe("escalated");
    expect(provider.routeChanges).toHaveLength(1);
    expect(provider.verifications).toHaveLength(1);
    expect(state.breaker.state).toBe("open");
    expect(state.servedDeploymentId).toBe(prior.id);
    expect(state.notifications).toEqual([expect.objectContaining({
      kind: "rollback-failure",
      state: "pending",
      manualSteps: expect.arrayContaining(["Keep the publication breaker open.", "Inspect provider routing before any manual route change."]),
    })]);
  });

  it("escalates thrown routing reads and recovery checks with manual steps instead of escaping", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const failed = { ...deployment("deployment:failed"), precedingValidDeploymentId: prior.id };
    const observations = [observation(failed.id, "manifest-hash", "probe:hash", clock.now().toISOString())];
    for (const provider of [
      {
        route: async () => { throw new Error("route-down"); },
        readRouting: async () => { throw new Error("routing-read-down"); },
        readPublicState: async () => { throw new Error("public-read-down"); },
        verify: async () => { throw new Error("not reached"); },
      },
      {
        route: async () => ({ providerDeploymentId: prior.providerDeploymentId, providerReference: "route:prior" }),
        readRouting: async () => ({ providerDeploymentId: prior.providerDeploymentId }),
        readPublicState: async () => { throw new Error("public-read-down"); },
        verify: async () => { throw new Error("checks-down"); },
      },
    ]) {
      const store = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: failed.id });
      const incident = await new RecoveryCoordinator({ store, provider, clock }).recover(observations);
      expect(incident.status).toBe("escalated");
      expect((await store.snapshot()).notifications).toEqual([expect.objectContaining({ kind: "rollback-failure", manualSteps: expect.any(Array) })]);
    }
  });

  it("blocks promotion while open, permits collection, forbids unchanged quarantine, and clears only verified served Valid", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const failed = { ...deployment("deployment:failed"), precedingValidDeploymentId: prior.id };
    const store = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const provider = new InMemoryRecoveryProvider({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const coordinator = new RecoveryCoordinator({ store, provider, clock });
    await coordinator.recover([observation(failed.id, "manifest-hash", "probe:hash", clock.now().toISOString())]);

    await expect(coordinator.assertPromotionAllowed(failed.candidateHash)).rejects.toThrow("quarantined-candidate-unchanged");
    await expect(coordinator.assertPromotionAllowed(sha256("candidate:new"))).rejects.toThrow("publication-breaker-open");
    await expect(coordinator.assertSourceCollectionAllowed()).resolves.toBeUndefined();
    await expect(coordinator.clearBreaker()).resolves.toMatchObject({ state: "closed" });

    const invalidStore = new InMemoryRecoveryStore({ deployments: [prior, { ...failed, state: "quarantined" }], servedDeploymentId: failed.id, breakerOpenFor: failed.id });
    const invalidCoordinator = new RecoveryCoordinator({ store: invalidStore, provider, clock });
    await expect(invalidCoordinator.clearBreaker()).rejects.toThrow("served-deployment-state-stale");
  });

  it("manually restores a retained Valid deployment with provider reconciliation and leaves clearance explicit", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const current = deployment("deployment:current");
    const store = new InMemoryRecoveryStore({ deployments: [prior, current], servedDeploymentId: current.id, breakerOpenFor: current.id });
    const provider = new InMemoryRecoveryProvider({ deployments: [prior, current], servedDeploymentId: current.id, ambiguousRouteResponses: 1 });
    const restore = new ManualRestoreCoordinator({ store, provider, clock });

    const result = await restore.restore(prior.id, "Owner selected retained version", "owner:michael");

    expect(result).toMatchObject({ deploymentId: prior.id, providerDeploymentId: prior.providerDeploymentId, verified: true });
    expect(provider.routeChanges).toHaveLength(1);
    expect((await store.snapshot())).toMatchObject({
      servedDeploymentId: prior.id,
      breaker: { state: "open" },
      outbox: [expect.objectContaining({ effect: "rollback", state: "applied" })],
      incidents: [expect.objectContaining({
        operator: {
          actor: "owner:michael",
          reason: "Owner selected retained version",
          selectedDeploymentId: prior.id,
          outcome: "recovered",
          notificationState: "not-required",
        },
      })],
    });
  });

  it("records rollback-failure escalation when manual restore verification fails", async () => {
    const clock = new ManualPublicationClock();
    const prior = deployment("deployment:prior");
    const current = deployment("deployment:current");
    const store = new InMemoryRecoveryStore({ deployments: [prior, current], servedDeploymentId: current.id });
    const provider = new InMemoryRecoveryProvider({ deployments: [prior, current], servedDeploymentId: current.id, verificationOutcome: "failed" });

    await expect(new ManualRestoreCoordinator({ store, provider, clock }).restore(prior.id, "Owner selected retained version", "owner:michael")).rejects.toThrow("manual-restore-verification-failed");

    expect((await store.snapshot())).toMatchObject({
      breaker: { state: "open" },
      notifications: [expect.objectContaining({ kind: "rollback-failure", state: "pending", manualSteps: expect.any(Array) })],
      incidents: [expect.objectContaining({
        operator: {
          actor: "owner:michael",
          reason: "Owner selected retained version",
          selectedDeploymentId: prior.id,
          outcome: "failed",
          notificationState: "pending",
        },
      })],
    });
  });

  it("restores an isolated in-memory control snapshot and observes provider public state independently", async () => {
    const prior = deployment("deployment:prior");
    const failed = { ...deployment("deployment:failed"), precedingValidDeploymentId: prior.id };
    const original = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: prior.id, breakerOpenFor: failed.id });
    const restored = InMemoryRecoveryStore.fromSnapshot(await original.snapshot());
    const provider = new InMemoryRecoveryProvider({ deployments: [prior, failed], servedDeploymentId: prior.id });

    await expect(restored.snapshot()).resolves.toEqual(await original.snapshot());
    await expect(provider.readPublicState()).resolves.toEqual({
      providerDeploymentId: prior.providerDeploymentId,
      publicOutputHash: prior.publicOutputHash,
      observedAt: expect.any(String),
    });
  });
});
