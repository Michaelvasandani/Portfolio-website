import { sha256 } from "../github/canonical";
import { ManualPublicationClock } from "../publication/clock";
import { evaluateRunbookExercise, monitorContinuity } from "./continuity";
import { InMemoryResendPort, RecoveryNotificationWorker } from "./notification";
import { InMemoryRetentionCleaner, InMemoryRetentionLedger, RetentionManager, planRetention, type RetentionRecord } from "./retention";
import { InMemoryRecoveryProvider, InMemoryRecoveryStore, ManualRestoreCoordinator, RecoveryCoordinator, type RecoveryDeployment } from "./service";

const day = 86_400_000;

export async function runLocalRecoveryHarness() {
  const clock = new ManualPublicationClock();
  const prior: RecoveryDeployment = {
    id: "deployment:prior-valid",
    providerDeploymentId: "provider:prior-valid",
    state: "valid",
    precedingValidDeploymentId: null,
    candidateHash: sha256("candidate:prior"),
    manifestHash: sha256("manifest:prior"),
    publicOutputHash: sha256("output:prior"),
    careerSnapshotId: "career:prior",
    createdAt: new Date(clock.now().getTime() - day).toISOString(),
  };
  const failed: RecoveryDeployment = {
    id: "deployment:objective-failure",
    providerDeploymentId: "provider:objective-failure",
    state: "valid",
    precedingValidDeploymentId: prior.id,
    candidateHash: sha256("candidate:failed"),
    manifestHash: sha256("manifest:failed"),
    publicOutputHash: sha256("output:failed"),
    careerSnapshotId: "career:failed",
    createdAt: clock.now().toISOString(),
  };
  const older: RecoveryDeployment = { ...prior, id: "deployment:older-valid", providerDeploymentId: "provider:older-valid", candidateHash: sha256("candidate:older"), manifestHash: sha256("manifest:older"), publicOutputHash: sha256("output:older"), careerSnapshotId: "career:older", createdAt: new Date(clock.now().getTime() - 2 * day).toISOString() };
  const recoveryStore = new InMemoryRecoveryStore({ deployments: [older, prior, failed], servedDeploymentId: failed.id });
  const recoveryProvider = new InMemoryRecoveryProvider({ deployments: [older, prior, failed], servedDeploymentId: failed.id, ambiguousRouteResponses: 2 });
  const coordinator = new RecoveryCoordinator({ store: recoveryStore, provider: recoveryProvider, clock });
  const incident = await coordinator.recover([{
    deploymentId: failed.id,
    kind: "manifest-hash",
    probeIdentity: "clean-probe:hash",
    observedAt: clock.now().toISOString(),
    check: {
      checkerId: "candidate-identity",
      checkerVersion: "1.0.0",
      configurationHash: sha256("recovery-check-configuration"),
      target: failed.id,
      startedAt: clock.now().toISOString(),
      finishedAt: clock.now().toISOString(),
      outcome: "failed",
      measurements: { manifestHashMatches: false },
      retryHistory: [],
      reportPointer: "memory://controlled-failure/hash",
    },
  }]);
  const resend = new InMemoryResendPort({ ambiguousResponses: 1 });
  await new RecoveryNotificationWorker({ store: recoveryStore, resend }).dispatchNext("notification-worker", clock.now());
  const automaticRecoveryState = await recoveryStore.snapshot();
  const automaticProviderMetrics = {
    routeChanges: structuredClone(recoveryProvider.routeChanges),
    providerReads: recoveryProvider.routingReads,
    verifications: structuredClone(recoveryProvider.verifications),
  };

  const retentionRecords: RetentionRecord[] = Array.from({ length: 21 }, (_, index) => ({
    id: `retained-valid:${index}`,
    kind: "valid-deployment" as const,
    createdAt: new Date(clock.now().getTime() - index * day).toISOString(),
    dependencies: [`retained-manifest:${index}`],
  })).flatMap((deployment, index) => [
    deployment,
    { id: `retained-manifest:${index}`, kind: "manifest" as const, createdAt: deployment.createdAt, dependencies: [] },
  ]);
  retentionRecords.push({ id: "audit:expired", kind: "compact-audit", createdAt: new Date(clock.now().getTime() - 366 * day).toISOString(), dependencies: [] });
  retentionRecords.push({ id: "diagnostic:expired", kind: "bulky-diagnostic", lifecycle: "quarantined", createdAt: new Date(clock.now().getTime() - 31 * day).toISOString(), dependencies: [] });
  const retentionPlan = planRetention(retentionRecords, clock.now());
  const retentionLedger = new InMemoryRetentionLedger();
  const retentionCleaner = new InMemoryRetentionCleaner({ ambiguousResponses: 1 });
  const retention = await new RetentionManager({ ledger: retentionLedger, cleaner: retentionCleaner }).apply(retentionPlan, clock.now());
  const retentionRerun = await new RetentionManager({ ledger: retentionLedger, cleaner: retentionCleaner }).apply(retentionPlan, new Date(clock.now().getTime() + day));

  const continuity = monitorContinuity({
    now: clock.now(),
    lastGithubCollectionAt: clock.now(),
    maximumCollectionAgeMilliseconds: day,
    backup: { checkedAt: clock.now(), maximumAgeMilliseconds: 7 * day, pointInTimeRecovery: true },
    oldestPendingEffectAt: null,
    maximumPendingEffectAgeMilliseconds: 3_600_000,
  });
  const delivered = automaticRecoveryState.notifications[0]!;
  const automaticPublicState = await recoveryProvider.readPublicState();
  const automaticProviderDeployment = automaticRecoveryState.deployments.find(({ providerDeploymentId }) => providerDeploymentId === automaticPublicState.providerDeploymentId);
  if (!automaticProviderDeployment) throw new Error("local-harness-provider-deployment-unrecorded");
  const recoveryOutboxPending = automaticRecoveryState.outbox.filter(({ state }) => state === "pending" || state === "leased").length;
  const recoveryOutboxFailed = automaticRecoveryState.outbox.filter(({ state }) => state === "failed").length;
  const exercise = evaluateRunbookExercise({
    exerciseId: "exercise:ticket-10-local-controlled-recovery",
    database: { servedDeploymentId: automaticRecoveryState.servedDeploymentId, publicOutputHash: prior.publicOutputHash, breaker: automaticRecoveryState.breaker.state },
    provider: { servedDeploymentId: automaticProviderDeployment.id },
    publicObservation: { publicOutputHash: automaticPublicState.publicOutputHash, checkedAt: automaticPublicState.observedAt },
    outbox: { pending: recoveryOutboxPending, failed: recoveryOutboxFailed },
    notification: { ledgerState: delivered.state, providerMessageId: delivered.providerMessageId },
    backup: { state: "healthy", pointInTimeRecovery: true },
    events: incident.timeline.map((entry) => ({ at: entry.at, actor: "recovery-worker", event: entry.event })),
  });
  const manualRestore = await new ManualRestoreCoordinator({ store: recoveryStore, provider: recoveryProvider, clock }).restore(older.id, "Local runbook exercise retained-version restore", "owner:local-runbook");
  const stateAfterManualRestore = await recoveryStore.snapshot();
  const clearedBreaker = await coordinator.clearBreaker();
  const stateAfterClearance = await recoveryStore.snapshot();
  const isolatedRestoredStore = InMemoryRecoveryStore.fromSnapshot(stateAfterClearance);
  const isolatedRestoredState = await isolatedRestoredStore.snapshot();
  const restoredProviderPublicState = await recoveryProvider.readPublicState();
  const restoredProviderDeployment = isolatedRestoredState.deployments.find(({ providerDeploymentId }) => providerDeploymentId === restoredProviderPublicState.providerDeploymentId);
  if (!restoredProviderDeployment) throw new Error("local-harness-restored-provider-deployment-unrecorded");
  const backupDatabaseRecoveryExercise = evaluateRunbookExercise({
    exerciseId: "exercise:ticket-10-local-database-recovery",
    database: { servedDeploymentId: isolatedRestoredState.servedDeploymentId, publicOutputHash: isolatedRestoredState.deployments.find(({ id }) => id === isolatedRestoredState.servedDeploymentId)!.publicOutputHash, breaker: isolatedRestoredState.breaker.state },
    provider: { servedDeploymentId: restoredProviderDeployment.id },
    publicObservation: { publicOutputHash: restoredProviderPublicState.publicOutputHash, checkedAt: restoredProviderPublicState.observedAt },
    outbox: { pending: isolatedRestoredState.outbox.filter(({ state }) => state === "pending" || state === "leased").length, failed: isolatedRestoredState.outbox.filter(({ state }) => state === "failed").length },
    notification: { ledgerState: delivered.state, providerMessageId: delivered.providerMessageId },
    backup: { state: "healthy", pointInTimeRecovery: true },
    events: [
      { at: clock.now().toISOString(), actor: "database-operator", event: "authoritative control snapshot exported" },
      { at: clock.now().toISOString(), actor: "database-operator", event: "isolated control store restored and reloaded" },
      { at: clock.now().toISOString(), actor: "database-operator", event: "provider routing and public output observed independently and reconciled" },
    ],
  });

  return {
    schemaVersion: 1,
    outcome: "locally-complete-live-controlled-failure-open",
    objectiveFailure: { classification: incident.failure, evidence: incident.evidence },
    recovery: {
      incident,
      databaseServedDeploymentId: automaticRecoveryState.servedDeploymentId,
      providerServedDeploymentId: automaticProviderDeployment.id,
      routeChanges: automaticProviderMetrics.routeChanges,
      providerReads: automaticProviderMetrics.providerReads,
      verifications: automaticProviderMetrics.verifications,
      breaker: automaticRecoveryState.breaker,
      quarantinedDeploymentId: automaticRecoveryState.deployments.find(({ state }) => state === "quarantined")?.id,
      outbox: automaticRecoveryState.outbox,
    },
    notification: {
      ledger: automaticRecoveryState.notifications,
      outbox: automaticRecoveryState.outbox.filter(({ effect }) => effect === "notification"),
      providerDeliveries: resend.deliveries,
      duplicateDeliveryCount: resend.deliveries.filter(({ idempotencyKey }) => idempotencyKey === delivered.idempotencyKey).length,
    },
    retention: {
      dryRun: { idempotencyKey: retentionPlan.idempotencyKey, summary: retentionPlan.summary, deletedIds: retentionPlan.deleted.map(({ id }) => id), blockedDependencyIds: retentionPlan.blockedDependencyIds },
      application: retention,
      idempotentRerun: retentionRerun,
      outbox: await retentionLedger.snapshot(),
      providerApplications: retentionCleaner.applications,
    },
    continuity,
    runbookExercise: exercise,
    operationalExercises: {
      manualRestore: {
        result: manualRestore,
        breakerAfterRestore: stateAfterManualRestore.breaker.state,
        audit: stateAfterManualRestore.incidents.find(({ id }) => id.startsWith("manual-restore:"))?.operator,
      },
      breakerClearance: clearedBreaker,
      retentionRerunMatches: JSON.stringify(retentionRerun) === JSON.stringify(retention),
      backupDatabaseRecovery: backupDatabaseRecoveryExercise,
    },
    externalAcceptanceBlockers: [
      "live-vercel-controlled-failure-and-routing-evidence-unavailable",
      "live-neon-transaction-backup-and-pitr-evidence-unavailable",
      "live-resend-ledger-provider-id-evidence-unavailable",
    ],
  };
}
