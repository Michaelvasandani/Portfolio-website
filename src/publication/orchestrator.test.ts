import { describe, expect, it } from "vitest";

import { InMemoryPublicationStore } from "./store";
import { PublicationOrchestrator } from "./orchestrator";
import { publicationFixture } from "./test-fixtures";
import {
  ExecutablePublicationChecks,
  InMemoryCandidatePackageStore,
  InMemoryDeploymentProvider,
  candidatePackageBytesHash,
  createDeterministicProductionProbe,
} from "./adapters";
import { ManualPublicationClock } from "./clock";
import { createPositiveFixture } from "../publication-checks/fixtures";
import { canonicalJson, sha256 } from "../github/canonical";
import { createPublicationScenario } from "./scenario";

async function advanceToValid(orchestrator: PublicationOrchestrator, runId: string, clock: ManualPublicationClock, worker: string) {
  for (let step = 0; step < 6; step += 1) await orchestrator.advance(runId, worker);
  clock.advance(45_000); await orchestrator.advance(runId, worker);
  clock.advance(45_000); await orchestrator.advance(runId, worker);
  await orchestrator.advance(runId, worker);
}

describe("publication orchestration", () => {
  it("coalesces superseded scheduled work while preserving immutable in-flight and resume inputs", async () => {
    const fixture = publicationFixture();
    const store = new InMemoryPublicationStore();
    const orchestrator = new PublicationOrchestrator({ ...fixture.dependencies, store });

    const inFlight = await orchestrator.trigger(fixture.input({ trigger: "schedule", githubSnapshotId: "github:one" }));
    await orchestrator.advance(inFlight.id, "worker:one");
    const superseded = await orchestrator.trigger(fixture.input({ trigger: "schedule", githubSnapshotId: "github:two" }));
    const newest = await orchestrator.trigger(fixture.input({ trigger: "schedule", githubSnapshotId: "github:three" }));
    const upload = await orchestrator.trigger(fixture.input({ trigger: "resume-upload", careerSnapshotId: "career:new" }));

    expect((await store.readRun(inFlight.id))?.input.githubSnapshotId).toBe("github:one");
    expect((await store.readRun(superseded.id))?.terminal).toEqual({ kind: "superseded", reason: "newer-scheduled-input" });
    expect((await store.readRun(newest.id))?.input.githubSnapshotId).toBe("github:three");
    expect((await store.readRun(upload.id))?.input.careerSnapshotId).toBe("career:new");
    expect(new Set([inFlight.id, superseded.id, newest.id, upload.id]).size).toBe(4);
  });

  it("promotes the exact checked deployment without rebuilding and advances Last valid after three passes across 90 seconds", async () => {
    const fixture = publicationFixture();
    const { clock, store, packages, deployments, orchestrator } = createPublicationScenario();
    const run = await orchestrator.trigger(fixture.input());

    await advanceToValid(orchestrator, run.id, clock, "worker:one");

    const finished = await store.readRun(run.id);
    const state = await store.snapshot();
    expect(finished?.terminal).toEqual({ kind: "succeeded" });
    expect(finished?.productionPasses.map(({ checkedAt }) => checkedAt)).toEqual([
      "2026-08-12T22:00:00.000Z", "2026-08-12T22:00:45.000Z", "2026-08-12T22:01:30.000Z",
    ]);
    expect(packages.retrievals).toHaveLength(1);
    expect(deployments.previewCreations).toHaveLength(1);
    expect(deployments.promotions).toEqual([expect.objectContaining({ providerDeploymentId: deployments.previewCreations[0]!.providerDeploymentId })]);
    expect(state.lastValidDeploymentId).toBe(`deployment:${deployments.previewCreations[0]!.providerDeploymentId}`);
    expect(state.deployments).toContainEqual(expect.objectContaining({ state: "valid" }));
    expect(state.manifests).toContainEqual(expect.objectContaining({ runId: run.id, deploymentId: state.lastValidDeploymentId }));
    expect(state.manifests[0]?.bindings).toEqual(fixture.input().candidate.manifestBindings);
    expect(state.manifests[0]?.previewValidation.outcome).toBe("passed");
    expect(state.qualityBaseline).toEqual(expect.objectContaining({ deploymentId: state.lastValidDeploymentId }));
    expect(state.audits).toContainEqual(expect.objectContaining({ event: "last-valid-advanced" }));
    expect(state.outbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ effect: "deployment", state: "applied" }),
      expect.objectContaining({ effect: "promotion", state: "applied" }),
      expect.objectContaining({ effect: "cleanup", state: "pending" }),
    ]));
  });

  it("reconciles ambiguous deployment, promotion, and outbox responses without duplicate effects", async () => {
    const fixture = publicationFixture();
    const { clock, store, packages, deployments, operationalEffects, orchestrator } = createPublicationScenario({ ambiguousPreviewResponses: 1, ambiguousPromotionResponses: 1, ambiguousOperationalResponses: 1 });
    const run = await orchestrator.trigger(fixture.input());

    for (let step = 0; step < 8; step += 1) await orchestrator.advance(run.id, "worker:one");
    clock.advance(45_000); await orchestrator.advance(run.id, "worker:one");
    clock.advance(45_000); await orchestrator.advance(run.id, "worker:one");
    await orchestrator.advance(run.id, "worker:one");
    await orchestrator.dispatchNextEffect("outbox:one");
    await orchestrator.dispatchNextEffect("outbox:two");

    expect((await store.readRun(run.id))?.terminal).toEqual({ kind: "succeeded" });
    expect(packages.retrievals).toHaveLength(1);
    expect(deployments.previewCreations).toHaveLength(1);
    expect(deployments.promotions).toHaveLength(1);
    expect(operationalEffects.applications).toHaveLength(1);
    expect((await store.snapshot()).outbox.find(({ effect }) => effect === "cleanup")?.state).toBe("applied");
  });

  it("fails a blocking preview without advancing Last valid and retains immutable inputs plus an unfinished notification", async () => {
    const fixture = publicationFixture();
    const checksFixture = createPositiveFixture();
    const clock = new ManualPublicationClock();
    const store = new InMemoryPublicationStore();
    const packages = new InMemoryCandidatePackageStore();
    const deployments = new InMemoryDeploymentProvider({ packages, clock, observations: checksFixture.target.preview.observations });
    const executable = new ExecutablePublicationChecks({ configuration: checksFixture.configuration, checkers: checksFixture.checkers, clock, productionProbe: createDeterministicProductionProbe(clock) });
    const passing = new PublicationOrchestrator({ store, packages, deployments, checks: executable, clock });
    const first = await passing.trigger(fixture.input());
    await advanceToValid(passing, first.id, clock, "worker:one");
    const priorLastValid = (await store.snapshot()).lastValidDeploymentId;

    const blocked = new PublicationOrchestrator({
      store, packages, deployments, clock,
      checks: {
        preview: async (target) => ({ ...await executable.preview(target), outcome: "blocked" }),
        production: (target) => executable.production(target),
      },
    });
    const priorCandidate = fixture.input().candidate;
    const replacementManifestHash = sha256("manifest:replacement");
    const replacementProjection = { ...priorCandidate.publicProjection, manifestHash: replacementManifestHash };
    const replacementContents = {
      id: "candidate:replacement", candidateHash: sha256("candidate:replacement"),
      publicOutputHash: sha256(canonicalJson(replacementProjection)), manifestHash: replacementManifestHash,
      publicProjection: replacementProjection,
      manifestBindings: priorCandidate.manifestBindings,
    };
    const second = await blocked.trigger(fixture.input({
      careerSnapshotId: "career:replacement",
      candidate: { ...replacementContents, bytesHash: candidatePackageBytesHash(replacementContents) },
    }));
    for (let step = 0; step < 4; step += 1) await blocked.advance(second.id, "worker:two");

    const rejected = await store.readRun(second.id);
    const state = await store.snapshot();
    expect(rejected?.terminal).toEqual({ kind: "failed", reason: "preview-checks-blocked" });
    expect(rejected?.input.careerSnapshotId).toBe("career:replacement");
    expect(state.lastValidDeploymentId).toBe(priorLastValid);
    expect(state.outbox).toContainEqual(expect.objectContaining({ runId: second.id, effect: "notification", state: "pending" }));
    expect(state.outbox).toContainEqual(expect.objectContaining({ runId: second.id, effect: "raw-deletion", state: "pending" }));
  });

  it("fails closed when a passing preview omits the configured checker inventory", async () => {
    const fixture = publicationFixture();
    const scenario = createPublicationScenario();
    const orchestrator = new PublicationOrchestrator({
      store: scenario.store, packages: scenario.packages, deployments: scenario.deployments, clock: scenario.clock,
      checks: {
        preview: async (target) => ({ ...await scenario.checks.preview(target), checks: [], outcome: "passed" }),
        production: (target) => scenario.checks.production(target),
      },
    });
    const run = await orchestrator.trigger(fixture.input());
    for (let step = 0; step < 4; step += 1) await orchestrator.advance(run.id, "worker");

    expect((await scenario.store.readRun(run.id))?.terminal).toEqual({ kind: "failed", reason: "preview-check-evidence-unpinned" });
    expect((await scenario.store.readDeployment(run.id))?.state).toBe("rejected");
  });

  it("prevents a stale worker from terminalizing a run after its lease was recovered", async () => {
    const fixture = publicationFixture();
    const clock = new ManualPublicationClock();
    const store = new InMemoryPublicationStore();
    const run = await store.createOrCoalesce(fixture.input(), clock.now());
    const stale = await store.leaseRun(run.id, "stale", clock.now(), new Date(clock.now().getTime() + 1_000));
    clock.advance(1_001);
    await store.sweep(clock.now(), 3);
    const current = await store.leaseRun(run.id, "current", clock.now(), new Date(clock.now().getTime() + 1_000));

    await expect(store.rejectRun(run.id, stale!.version, "stale", "stale-failure", clock.now())).resolves.toBeNull();
    expect(current?.lease?.owner).toBe("current");
    expect((await store.readRun(run.id))?.terminal).toBeNull();
  });

  it("records an applied outbox effect and its audit exactly once across checkpoint retry", async () => {
    const store = new InMemoryPublicationStore();
    const fixture = publicationFixture();
    const run = await store.createOrCoalesce(fixture.input(), new Date("2026-08-12T22:00:00.000Z"));
    const effect = await store.enqueueEffect(run.id, "cleanup", "cleanup:once", new Date("2026-08-12T22:00:00.000Z"));
    await store.markEffectApplied(effect.id, "provider:once", new Date("2026-08-12T22:00:01.000Z"));
    await store.markEffectApplied(effect.id, "provider:once", new Date("2026-08-12T22:00:02.000Z"));

    expect((await store.snapshot()).audits.filter(({ event }) => event === "outbox-cleanup-applied")).toHaveLength(1);
  });

  it("prevents an expired outbox worker from overwriting sweeper terminalization", async () => {
    const fixture = publicationFixture();
    const store = new InMemoryPublicationStore();
    const now = new Date("2026-08-12T22:00:00.000Z");
    const run = await store.createOrCoalesce(fixture.input(), now);
    await store.enqueueEffect(run.id, "cleanup", "cleanup:expired", now);
    let lease = await store.leaseNextEffect("stale", now, new Date(now.getTime() + 1));
    for (let attempt = 1; attempt < 3; attempt += 1) {
      await store.releaseEffect(lease!.id, "stale");
      lease = await store.leaseNextEffect("stale", now, new Date(now.getTime() + 1));
    }
    await store.sweep(new Date(now.getTime() + 2), 3);

    await expect(store.markEffectApplied(lease!.id, "provider:late", new Date(now.getTime() + 3), "stale")).rejects.toThrow("outbox-lease-not-owned");
    expect((await store.snapshot()).outbox.find(({ id }) => id === lease!.id)?.state).toBe("failed");
    expect((await store.snapshot()).outbox).toContainEqual(expect.objectContaining({ idempotencyKey: `stuck-outbox:${lease!.id}`, effect: "notification" }));
  });

  it("accepts a fresh successful retry after an isolated crashed checker attempt", async () => {
    const fixture = publicationFixture();
    const scenario = createPublicationScenario();
    const baseProduction = createDeterministicProductionProbe(scenario.clock);
    const orchestrator = new PublicationOrchestrator({
      store: scenario.store, packages: scenario.packages, deployments: scenario.deployments, clock: scenario.clock,
      checks: {
        preview: (target) => scenario.checks.preview(target),
        production: async (target) => {
          const report = await baseProduction(target);
          if (report.outcome === "blocked") return report;
          return {
            outcome: "passed",
            pass: {
              ...report.pass,
              checks: report.pass.checks.map((check) => ({
                ...check,
                attempts: [
                  { attempt: 1, cleanEnvironmentId: sha256(`${check.targetIdentity}:crashed`), integrity: "crashed" as const, reportPointer: null },
                  { attempt: 2, cleanEnvironmentId: sha256(`${check.targetIdentity}:passed`), integrity: "valid" as const, reportPointer: check.reportPointer },
                ],
              })),
            },
          };
        },
      },
    });
    const run = await orchestrator.trigger(fixture.input());

    await advanceToValid(orchestrator, run.id, scenario.clock, "worker");
    expect((await scenario.store.readRun(run.id))?.terminal).toEqual({ kind: "succeeded" });
  });

  it("fails closed when a Production pass omits required QAL-006 checker evidence", async () => {
    const fixture = publicationFixture();
    const checksFixture = createPositiveFixture();
    const clock = new ManualPublicationClock();
    const store = new InMemoryPublicationStore();
    const packages = new InMemoryCandidatePackageStore();
    const deployments = new InMemoryDeploymentProvider({ packages, clock, observations: checksFixture.target.preview.observations });
    const previewChecks = new ExecutablePublicationChecks({ configuration: checksFixture.configuration, checkers: checksFixture.checkers, clock, productionProbe: createDeterministicProductionProbe(clock) });
    const orchestrator = new PublicationOrchestrator({
      store, packages, deployments, clock,
      checks: {
        preview: (target) => previewChecks.preview(target),
        production: async (target) => ({
          outcome: "passed",
          pass: { ...target, deploymentId: target.providerDeploymentId, checkedAt: clock.now().toISOString(), checks: [] },
        }),
      },
    });
    const run = await orchestrator.trigger(fixture.input());
    for (let step = 0; step < 6; step += 1) await orchestrator.advance(run.id, "worker");

    expect((await store.readRun(run.id))?.terminal).toEqual({ kind: "failed", reason: "production-check-incomplete" });
    expect((await store.snapshot()).lastValidDeploymentId).toBeNull();
  });

  it("retains blocked Production diagnostics before terminalizing", async () => {
    const fixture = publicationFixture();
    const scenario = createPublicationScenario();
    const orchestrator = new PublicationOrchestrator({
      store: scenario.store, packages: scenario.packages, deployments: scenario.deployments, clock: scenario.clock,
      checks: {
        preview: (target) => scenario.checks.preview(target),
        production: async (target) => {
          const passed = await createDeterministicProductionProbe(scenario.clock)(target);
          if (passed.outcome === "blocked") return passed;
          return { outcome: "blocked", reason: "runtime-unavailable", reportPointer: "memory://production/blocked", checks: [passed.pass.checks[0]!, ...passed.pass.checks.slice(1)] };
        },
      },
    });
    const run = await orchestrator.trigger(fixture.input());
    for (let step = 0; step < 6; step += 1) await orchestrator.advance(run.id, "worker");

    const rejected = await scenario.store.readRun(run.id);
    expect(rejected?.terminal).toEqual({ kind: "failed", reason: "production-checks-blocked:runtime-unavailable" });
    expect(rejected?.productionDiagnostics).toEqual([expect.objectContaining({ reason: "runtime-unavailable", reportPointer: "memory://production/blocked" })]);
  });

  it("serializes competing workers and sweeps expired leases, bounded retries, and missed schedules", async () => {
    const fixture = publicationFixture();
    const clock = new ManualPublicationClock();
    const store = new InMemoryPublicationStore();
    const orchestrator = new PublicationOrchestrator({ ...fixture.dependencies, store, clock, maximumAttempts: 3, leaseMilliseconds: 1_000 });
    const concurrent = await orchestrator.trigger(fixture.input());
    const results = await Promise.all([
      orchestrator.advance(concurrent.id, "worker:one"), orchestrator.advance(concurrent.id, "worker:two"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const lease = await store.leaseRun(concurrent.id, "crashed-worker", clock.now(), new Date(clock.now().getTime() + 1_000));
    expect(lease).not.toBeNull();
    await store.recordAttempt(concurrent.id, lease!.version, "crashed-worker", "packaging", clock.now());
    clock.advance(1_001);
    const recovered = await orchestrator.sweep({ lastGithubCollectionAt: new Date(clock.now().getTime() - 86_400_001), maximumScheduleAgeMilliseconds: 86_400_000 });
    expect(recovered).toMatchObject({ releasedRunIds: [concurrent.id], missedSchedule: true });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const next = await store.leaseRun(concurrent.id, `crashed:${attempt}`, clock.now(), new Date(clock.now().getTime() + 1_000));
      await store.recordAttempt(concurrent.id, next!.version, `crashed:${attempt}`, "packaging", clock.now());
      clock.advance(1_001);
      await orchestrator.sweep({ lastGithubCollectionAt: clock.now(), maximumScheduleAgeMilliseconds: 86_400_000 });
    }
    expect((await store.readRun(concurrent.id))?.terminal).toEqual({ kind: "failed", reason: "bounded-retries-exhausted:packaging" });
  });

  it("limits each short-lived build credential to one immutable package and one retrieval", async () => {
    const fixture = publicationFixture();
    const clock = new ManualPublicationClock();
    const packages = new InMemoryCandidatePackageStore();
    const first = fixture.input().candidate;
    const secondContents = {
      id: "candidate:two", candidateHash: sha256("two"), publicOutputHash: first.publicOutputHash,
      manifestHash: first.manifestHash, publicProjection: first.publicProjection,
      manifestBindings: first.manifestBindings,
    };
    const second = { ...secondContents, bytesHash: candidatePackageBytesHash(secondContents) };
    const firstStored = await packages.put(first, "put:first");
    const secondStored = await packages.put(second, "put:second");
    const credential = await packages.issueBuildCredential({ packageId: firstStored.packageId, candidateHash: first.candidateHash, expiresAt: new Date(clock.now().getTime() + 1_000).toISOString() });

    await expect(packages.retrieve(credential.token, secondStored.packageId, clock.now().toISOString())).rejects.toThrow("candidate-credential-scope-denied");
    await expect(packages.retrieve(credential.token, firstStored.packageId, clock.now().toISOString())).resolves.toEqual(first);
    await expect(packages.retrieve(credential.token, firstStored.packageId, clock.now().toISOString())).rejects.toThrow("candidate-credential-already-used");
  });
});
