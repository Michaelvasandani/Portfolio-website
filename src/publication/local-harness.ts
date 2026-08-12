import { scanPublicProjection } from "./adapters";
import { ManualPublicationClock } from "./clock";
import { PublicationOrchestrator } from "./orchestrator";
import { InMemoryPublicationStore } from "./store";
import { publicationFixture } from "./test-fixtures";
import { createPublicationScenario } from "./scenario";

export async function runLocalPublicationHarness() {
  const fixture = publicationFixture();
  const { clock, store, packages, deployments, operationalEffects, orchestrator } = createPublicationScenario({ ambiguousPreviewResponses: 1, ambiguousPromotionResponses: 1, ambiguousOperationalResponses: 1 });
  const run = await orchestrator.trigger(fixture.input({ trigger: "schedule" }));
  const competingWorkers = await Promise.all([
    orchestrator.advance(run.id, "worker:one"), orchestrator.advance(run.id, "worker:two"),
  ]);
  for (let step = 0; step < 7; step += 1) await orchestrator.advance(run.id, "worker:one");
  clock.advance(45_000); await orchestrator.advance(run.id, "worker:one");
  clock.advance(45_000); await orchestrator.advance(run.id, "worker:one");
  await orchestrator.advance(run.id, "worker:one");
  await orchestrator.dispatchNextEffect("outbox:one");
  await orchestrator.dispatchNextEffect("outbox:two");
  const finalRun = await store.readRun(run.id);
  const state = await store.snapshot();
  if (!finalRun || finalRun.terminal?.kind !== "succeeded" || !state.lastValidDeploymentId) {
    throw new Error("local-publication-harness-did-not-succeed");
  }

  const sweepClock = new ManualPublicationClock();
  const sweepStore = new InMemoryPublicationStore();
  const sweepOrchestrator = new PublicationOrchestrator({ ...fixture.dependencies, store: sweepStore, clock: sweepClock, leaseMilliseconds: 1_000 });
  const sweptRun = await sweepOrchestrator.trigger(fixture.input());
  await sweepOrchestrator.advance(sweptRun.id, "worker");
  const leased = await sweepStore.leaseRun(sweptRun.id, "crashed", sweepClock.now(), new Date(sweepClock.now().getTime() + 1_000));
  if (!leased) throw new Error("local-sweeper-lease-unavailable");
  await sweepStore.recordAttempt(sweptRun.id, leased.version, "crashed", leased.phase, sweepClock.now());
  sweepClock.advance(1_001);
  const sweep = await sweepOrchestrator.sweep({
    lastGithubCollectionAt: new Date(sweepClock.now().getTime() - 86_400_001),
    maximumScheduleAgeMilliseconds: 86_400_000,
  });
  const boundedRetrySweeps = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const next = await sweepStore.leaseRun(sweptRun.id, `crashed:${attempt}`, sweepClock.now(), new Date(sweepClock.now().getTime() + 1_000));
    if (!next) throw new Error("local-sweeper-retry-lease-unavailable");
    await sweepStore.recordAttempt(sweptRun.id, next.version, `crashed:${attempt}`, next.phase, sweepClock.now());
    sweepClock.advance(1_001);
    boundedRetrySweeps.push(await sweepOrchestrator.sweep({
      lastGithubCollectionAt: sweepClock.now(), maximumScheduleAgeMilliseconds: 86_400_000,
    }));
  }

  return {
    schemaVersion: 1,
    outcome: "locally-complete-live-acceptance-blocked",
    run: { id: finalRun.id, terminal: finalRun.terminal, input: finalRun.input, attempts: finalRun.attempts },
    serialization: { winningWorkers: competingWorkers.filter(Boolean).length, immutableInputHash: finalRun.input.candidate.candidateHash },
    stateTransitionHistory: state.audits.filter(({ event }) => event === "publication-run-transition"),
    idempotencyLedger: state.outbox.map(({ effect, idempotencyKey, state, providerReference }) => ({ effect, idempotencyKey, state, providerReference })),
    packageAndBuild: {
      packageHash: finalRun.input.candidate.bytesHash,
      candidateHash: finalRun.input.candidate.candidateHash,
      publicOutputHash: finalRun.input.candidate.publicOutputHash,
      credentialRetrievals: packages.retrievals.length,
      pinnedCommits: deployments.previewCreations.map(({ commit }) => commit),
    },
    deployment: {
      previewCreations: deployments.previewCreations,
      promotions: deployments.promotions,
      exactDeploymentPromoted: deployments.previewCreations[0]?.providerDeploymentId === deployments.promotions[0]?.providerDeploymentId,
    },
    production: {
      passes: finalRun.productionPasses,
      observationWindowMilliseconds: new Date(finalRun.productionPasses[2]!.checkedAt).getTime() - new Date(finalRun.productionPasses[0]!.checkedAt).getTime(),
    },
    finalTransaction: {
      lastValidDeploymentId: state.lastValidDeploymentId,
      validDeploymentId: state.deployments.find(({ state: status }) => status === "valid")?.id,
      manifestDeploymentId: state.manifests[0]?.deploymentId,
      baselineDeploymentId: state.qualityBaseline?.deploymentId,
      auditRecorded: state.audits.some(({ event }) => event === "last-valid-advanced"),
    },
    ambiguityReconciliation: {
      previewEffects: deployments.previewCreations.length,
      promotionEffects: deployments.promotions.length,
      operationalEffects: operationalEffects.applications.length,
    },
    sweeper: { expiredLeaseAndMissedSchedule: sweep, boundedRetrySweeps },
    publicProjectionScan: scanPublicProjection(finalRun.input.candidate.publicProjection),
    externalAcceptanceBlockers: [
      "ticket-02-live-neon-blob-vercel-resend-resources-unavailable",
      "ticket-07-live-zero-retention-generation-provider-unavailable",
      "ticket-08-provider-created-zero-traffic-preview-unavailable",
    ],
  };
}
