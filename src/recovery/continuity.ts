import type { Sha256 } from "../publication-checks/contracts";
import type { NotificationKind } from "./service";

export type ContinuityFindingCode = "missed-github-collection" | "backup-status-stale" | "point-in-time-recovery-unconfigured" | "outbox-reconciliation-stuck";
export type ContinuityReport = Readonly<{
  status: "healthy" | "action-required";
  checkedAt: string;
  findings: readonly Readonly<{ code: ContinuityFindingCode; observedAt: string | null; action: string }>[];
  notifications: readonly Readonly<{ kind: NotificationKind; subject: string; details: string }>[];
}>;

export function monitorContinuity(input: {
  now: Date;
  lastGithubCollectionAt: Date;
  maximumCollectionAgeMilliseconds: number;
  backup: { checkedAt: Date; maximumAgeMilliseconds: number; pointInTimeRecovery: boolean };
  oldestPendingEffectAt: Date | null;
  maximumPendingEffectAgeMilliseconds: number;
}): ContinuityReport {
  const findings: ContinuityReport["findings"][number][] = [];
  const notifications: ContinuityReport["notifications"][number][] = [];
  const missedCollection = input.now.getTime() - input.lastGithubCollectionAt.getTime() > input.maximumCollectionAgeMilliseconds;
  if (missedCollection) {
    findings.push({ code: "missed-github-collection", observedAt: input.lastGithubCollectionAt.toISOString(), action: "Inspect the GitHub Actions schedule and preserve the prior valid snapshot." });
    notifications.push({ kind: "missed-github-collection", subject: "Daily GitHub collection missed", details: `Last valid collection: ${input.lastGithubCollectionAt.toISOString()}.` });
  }
  const backupStale = input.now.getTime() - input.backup.checkedAt.getTime() > input.backup.maximumAgeMilliseconds;
  if (backupStale) findings.push({ code: "backup-status-stale", observedAt: input.backup.checkedAt.toISOString(), action: "Verify Neon backup status and point-in-time recovery in the provider console." });
  if (!input.backup.pointInTimeRecovery) findings.push({ code: "point-in-time-recovery-unconfigured", observedAt: input.backup.checkedAt.toISOString(), action: "Keep promotion stopped until point-in-time recovery is verified." });
  if (backupStale || !input.backup.pointInTimeRecovery) {
    notifications.push({ kind: "stuck-reconciliation", subject: "Backup verification requires action", details: "Neon backup/PITR status is stale or not configured; follow the backup runbook." });
  }
  const stuckEffect = input.oldestPendingEffectAt !== null
    && input.now.getTime() - input.oldestPendingEffectAt.getTime() > input.maximumPendingEffectAgeMilliseconds;
  if (stuckEffect) {
    findings.push({ code: "outbox-reconciliation-stuck", observedAt: input.oldestPendingEffectAt!.toISOString(), action: "Read provider state before retrying the leased outbox effect." });
    notifications.push({ kind: "stuck-reconciliation", subject: "Outbox reconciliation requires action", details: `Oldest pending effect: ${input.oldestPendingEffectAt!.toISOString()}.` });
  }
  return { status: findings.length ? "action-required" : "healthy", checkedAt: input.now.toISOString(), findings, notifications };
}

export type RunbookExerciseInput = Readonly<{
  exerciseId: string;
  database: { servedDeploymentId: string; publicOutputHash: Sha256; breaker: "open" | "closed" };
  provider: { servedDeploymentId: string };
  publicObservation: { publicOutputHash: Sha256; checkedAt: string };
  outbox: { pending: number; failed: number };
  notification: { ledgerState: "pending" | "delivered" | "failed"; providerMessageId: string | null };
  backup: { state: "healthy" | "stale" | "unknown"; pointInTimeRecovery: boolean };
  events: readonly Readonly<{ at: string; actor: string; event: string }>[];
}>;

export type RunbookExerciseResult = Readonly<{
  exerciseId: string;
  status: "passed" | "failed";
  discrepancies: readonly string[];
  timeline: readonly string[];
  checkedState: Readonly<{
    databaseServedDeploymentId: string;
    providerServedDeploymentId: string;
    publicOutputHash: Sha256;
    pendingOutbox: number;
    notificationProviderMessageId: string | null;
    backupState: string;
  }>;
}>;

export function evaluateRunbookExercise(input: RunbookExerciseInput): RunbookExerciseResult {
  const discrepancies: string[] = [];
  if (input.database.servedDeploymentId !== input.provider.servedDeploymentId) discrepancies.push("database-provider-served-deployment-mismatch");
  if (input.database.publicOutputHash !== input.publicObservation.publicOutputHash) discrepancies.push("database-public-output-hash-mismatch");
  if (input.outbox.pending !== 0 || input.outbox.failed !== 0) discrepancies.push("outbox-not-converged");
  if (input.notification.ledgerState !== "delivered" || !input.notification.providerMessageId) discrepancies.push("notification-not-reconciled");
  if (input.backup.state !== "healthy" || !input.backup.pointInTimeRecovery) discrepancies.push("backup-not-verified");
  const timeline = [...input.events]
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())
    .map(({ at, actor, event }) => `${at} · ${actor} · ${event}`);
  if (!timeline.length) discrepancies.push("operator-timeline-empty");
  return {
    exerciseId: input.exerciseId,
    status: discrepancies.length ? "failed" : "passed",
    discrepancies,
    timeline,
    checkedState: {
      databaseServedDeploymentId: input.database.servedDeploymentId,
      providerServedDeploymentId: input.provider.servedDeploymentId,
      publicOutputHash: input.publicObservation.publicOutputHash,
      pendingOutbox: input.outbox.pending,
      notificationProviderMessageId: input.notification.providerMessageId,
      backupState: input.backup.state,
    },
  };
}
