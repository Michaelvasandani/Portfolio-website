import { sha256 } from "../github/canonical";
import type { Sha256 } from "../publication-checks/contracts";
import { clone } from "./provider-effect";

export type ImmediateFailureKind = "manifest-hash" | "deployment-hash" | "critical-content";
export type SmokeFailureKind = "availability" | "asset" | "runtime" | "navigation" | "accessibility-smoke";
export type NonRecoveryObservationKind = "performance" | "external-link" | "field-metric" | "subjective-aesthetic";
export type ProductionObservationKind = ImmediateFailureKind | SmokeFailureKind | NonRecoveryObservationKind;

export type ProductionFailureObservation = Readonly<{
  deploymentId: string;
  kind: ProductionObservationKind;
  probeIdentity: string;
  observedAt: string;
  check: Readonly<{
    checkerId: string;
    checkerVersion: string;
    configurationHash: Sha256;
    target: string;
    startedAt: string;
    finishedAt: string;
    outcome: "failed";
    measurements: Readonly<Record<string, string | number | boolean | null>>;
    retryHistory: readonly string[];
    reportPointer: string;
  }>;
}>;

export type ObjectiveFailure = Readonly<{
  trigger: "immediate" | "confirmed-smoke";
  kind: ImmediateFailureKind | SmokeFailureKind;
  evidenceCount: number;
}>;

export { classifyObjectiveFailure } from "./failure-policy";

export type RecoveryDeployment = Readonly<{
  id: string;
  providerDeploymentId: string;
  state: "valid" | "quarantined";
  precedingValidDeploymentId: string | null;
  candidateHash: Sha256;
  manifestHash: Sha256;
  publicOutputHash: Sha256;
  careerSnapshotId: string;
  createdAt: string;
}>;

export type BreakerState = Readonly<{
  state: "closed" | "open";
  failingDeploymentId: string | null;
  reason: string | null;
  openedAt: string | null;
  clearedAt: string | null;
}>;

export type RecoveryTimelineEntry = Readonly<{
  sequence: number;
  at: string;
  event:
    | "objective-failure-confirmed"
    | "breaker-opened"
    | "rollback-intent-recorded"
    | "provider-routing-observed"
    | "recovery-checks-passed"
    | "recovery-checks-failed"
    | "failed-deployment-quarantined"
    | "notification-recorded"
    | "breaker-cleared";
  details: Readonly<Record<string, string | boolean | number | null>>;
}>;

export type RecoveryIncident = Readonly<{
  id: string;
  failedDeploymentId: string;
  targetDeploymentId: string;
  failure: ObjectiveFailure | null;
  evidence: readonly ProductionFailureObservation[];
  status: "routing" | "verifying" | "recovered" | "escalated";
  restoreAttemptedAt: string;
  providerObservedDeploymentId: string | null;
  verificationReportPointer: string | null;
  verification: RecoveryVerification | null;
  operator: Readonly<{
    actor: string;
    reason: string;
    selectedDeploymentId: string;
    outcome: "pending" | "recovered" | "failed";
    notificationState: "not-required" | "pending" | "delivered" | "failed";
  }> | null;
  timeline: readonly RecoveryTimelineEntry[];
}>;

export type RecoveryOutboxRecord = Readonly<{
  id: string;
  incidentId: string;
  effect: "rollback" | "notification";
  idempotencyKey: string;
  state: "pending" | "leased" | "applied" | "failed";
  attempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  providerReference: string | null;
}>;

export type NotificationKind = "automatic-rollback" | "rollback-failure" | "terminal-publication-failure" | "stuck-reconciliation" | "missed-github-collection" | "security-rejection";
export type NotificationLedgerRecord = Readonly<{
  id: string;
  incidentId: string;
  kind: NotificationKind;
  idempotencyKey: string;
  state: "pending" | "delivered" | "failed";
  providerMessageId: string | null;
  createdAt: string;
  subject: string;
  details: string;
  manualSteps: readonly string[];
}>;

export type RecoverySnapshot = Readonly<{
  servedDeploymentId: string;
  deployments: readonly RecoveryDeployment[];
  breaker: BreakerState;
  incidents: readonly RecoveryIncident[];
  outbox: readonly RecoveryOutboxRecord[];
  notifications: readonly NotificationLedgerRecord[];
}>;

export interface RecoveryStore {
  begin(input: { failedDeploymentId: string; failure: ObjectiveFailure; evidence: readonly ProductionFailureObservation[]; now: Date }): Promise<RecoveryIncident>;
  routingObserved(input: { incidentId: string; providerDeploymentId: string; providerReference: string; now: Date }): Promise<RecoveryIncident>;
  complete(input: { incidentId: string; verification: RecoveryVerification; now: Date }): Promise<RecoveryIncident>;
  escalate(input: { incidentId: string; providerDeploymentId: string; verification: RecoveryVerification | null; reason: string; now: Date }): Promise<RecoveryIncident>;
  clearBreaker(input: { servedDeploymentId: string; reportPointer: string; now: Date }): Promise<BreakerState>;
  leaseNextNotification(owner: string, now: Date, expiresAt: Date): Promise<{ notification: NotificationLedgerRecord; outbox: RecoveryOutboxRecord } | null>;
  notificationDelivered(input: { notificationId: string; outboxId: string; owner: string; providerMessageId: string }): Promise<NotificationLedgerRecord>;
  releaseNotification(input: { outboxId: string; owner: string; terminal: boolean }): Promise<void>;
  beginManualRestore(input: { deploymentId: string; reason: string; actor: string; now: Date }): Promise<{ incidentId: string; idempotencyKey: string }>;
  manualRestoreFailed(input: { incidentId: string; failureReason: string; providerDeploymentId: string | null; verification: RecoveryVerification | null; now: Date }): Promise<void>;
  manualRestoreObserved(input: { incidentId: string; deploymentId: string; providerDeploymentId: string; providerReference: string; verification: RecoveryVerification; now: Date }): Promise<void>;
  snapshot(): Promise<RecoverySnapshot>;
}

export type RecoveryVerification = Readonly<{
  providerDeploymentId: string;
  candidateHash: Sha256;
  manifestHash: Sha256;
  publicOutputHash: Sha256;
  check: Readonly<{
    checkerId: string;
    checkerVersion: string;
    rulesHash: Sha256;
    configurationHash: Sha256;
    environment: Readonly<{
      runner: string;
      image: string;
      cleanEnvironmentId: string;
    }>;
    target: string;
    startedAt: string;
    finishedAt: string;
    outcome: "passed" | "failed";
    measurements: Readonly<Record<string, string | number | boolean | null>>;
    retryHistory: readonly string[];
    reportPointer: string;
  }>;
}>;

export interface RecoveryProvider {
  readRouting(): Promise<{ providerDeploymentId: string }>;
  readPublicState(): Promise<{ providerDeploymentId: string; publicOutputHash: Sha256; observedAt: string }>;
  route(input: { idempotencyKey: string; providerDeploymentId: string }): Promise<{ providerDeploymentId: string; providerReference: string }>;
  verify(input: RecoveryDeployment, checkedAt?: Date): Promise<RecoveryVerification>;
}

export class InMemoryRecoveryStore implements RecoveryStore {
  readonly #deployments = new Map<string, RecoveryDeployment>();
  readonly #incidents = new Map<string, RecoveryIncident>();
  readonly #outbox = new Map<string, RecoveryOutboxRecord>();
  readonly #notifications = new Map<string, NotificationLedgerRecord>();
  #servedDeploymentId: string;
  #breaker: BreakerState;

  constructor(input: { deployments: readonly RecoveryDeployment[]; servedDeploymentId: string; breakerOpenFor?: string }) {
    for (const deployment of input.deployments) this.#deployments.set(deployment.id, clone(deployment));
    if (!this.#deployments.has(input.servedDeploymentId)) throw new Error("served-deployment-missing");
    this.#servedDeploymentId = input.servedDeploymentId;
    this.#breaker = input.breakerOpenFor
      ? { state: "open", failingDeploymentId: input.breakerOpenFor, reason: "existing-recovery", openedAt: "2026-08-12T20:00:00.000Z", clearedAt: null }
      : { state: "closed", failingDeploymentId: null, reason: null, openedAt: null, clearedAt: null };
  }

  static fromSnapshot(snapshot: RecoverySnapshot): InMemoryRecoveryStore {
    const store = new InMemoryRecoveryStore({ deployments: snapshot.deployments, servedDeploymentId: snapshot.servedDeploymentId });
    store.#breaker = clone(snapshot.breaker);
    for (const incident of snapshot.incidents) store.#incidents.set(incident.id, clone(incident));
    for (const outbox of snapshot.outbox) store.#outbox.set(outbox.id, clone(outbox));
    for (const notification of snapshot.notifications) store.#notifications.set(notification.id, clone(notification));
    return store;
  }

  async begin(input: { failedDeploymentId: string; failure: ObjectiveFailure; evidence: readonly ProductionFailureObservation[]; now: Date }): Promise<RecoveryIncident> {
    const id = `recovery:${input.failedDeploymentId}`;
    const existing = this.#incidents.get(id);
    if (existing) return clone(existing);
    const failed = this.#deployments.get(input.failedDeploymentId);
    if (!failed) throw new Error("failed-deployment-missing");
    const target = failed.precedingValidDeploymentId ? this.#deployments.get(failed.precedingValidDeploymentId) : null;
    if (!target || target.state !== "valid") throw new Error("preceding-valid-deployment-missing");
    const at = input.now.toISOString();
    const timeline: RecoveryTimelineEntry[] = [
      this.#entry(1, at, "objective-failure-confirmed", { kind: input.failure.kind, trigger: input.failure.trigger }),
      this.#entry(2, at, "breaker-opened", { failingDeploymentId: failed.id }),
      this.#entry(3, at, "rollback-intent-recorded", { targetDeploymentId: target.id }),
    ];
    const incident: RecoveryIncident = {
      id,
      failedDeploymentId: failed.id,
      targetDeploymentId: target.id,
      failure: clone(input.failure),
      evidence: clone(input.evidence),
      status: "routing",
      restoreAttemptedAt: at,
      providerObservedDeploymentId: null,
      verificationReportPointer: null,
      verification: null,
      operator: null,
      timeline,
    };
    this.#breaker = { state: "open", failingDeploymentId: failed.id, reason: `${input.failure.trigger}:${input.failure.kind}`, openedAt: at, clearedAt: null };
    this.#incidents.set(id, incident);
    const idempotencyKey = `rollback:${id}`;
    this.#outbox.set(`outbox:${idempotencyKey}`, { id: `outbox:${idempotencyKey}`, incidentId: id, effect: "rollback", idempotencyKey, state: "pending", attempts: 0, leaseOwner: null, leaseExpiresAt: null, providerReference: null });
    return clone(incident);
  }

  async routingObserved(input: { incidentId: string; providerDeploymentId: string; providerReference: string; now: Date }): Promise<RecoveryIncident> {
    const incident = this.#requiredIncident(input.incidentId);
    if (incident.status !== "routing") return clone(incident);
    const target = this.#deployments.get(incident.targetDeploymentId)!;
    const observed = [...this.#deployments.values()].find(({ providerDeploymentId }) => providerDeploymentId === input.providerDeploymentId);
    if (!observed) throw new Error("provider-observed-deployment-unknown");
    this.#servedDeploymentId = observed.id;
    const outbox = this.#outbox.get(`outbox:rollback:${incident.id}`)!;
    this.#outbox.set(outbox.id, {
      ...outbox,
      state: input.providerDeploymentId === target.providerDeploymentId ? "applied" : "failed",
      leaseOwner: null,
      leaseExpiresAt: null,
      providerReference: input.providerReference,
    });
    const updated: RecoveryIncident = {
      ...incident,
      status: "verifying",
      providerObservedDeploymentId: input.providerDeploymentId,
      timeline: [...incident.timeline, this.#entry(incident.timeline.length + 1, input.now.toISOString(), "provider-routing-observed", { providerDeploymentId: input.providerDeploymentId })],
    };
    this.#incidents.set(updated.id, updated);
    return clone(updated);
  }

  async complete(input: { incidentId: string; verification: RecoveryVerification; now: Date }): Promise<RecoveryIncident> {
    const incident = this.#requiredIncident(input.incidentId);
    if (incident.status === "recovered" || incident.status === "escalated") return clone(incident);
    if (incident.status !== "verifying") throw new Error("recovery-routing-not-observed");
    const failed = this.#deployments.get(incident.failedDeploymentId)!;
    const target = this.#deployments.get(incident.targetDeploymentId)!;
    this.#servedDeploymentId = target.id;
    this.#deployments.set(failed.id, { ...failed, state: "quarantined" });
    const at = input.now.toISOString();
    const updated: RecoveryIncident = {
      ...incident,
      status: "recovered",
      verificationReportPointer: input.verification.check.reportPointer,
      verification: clone(input.verification),
      timeline: [
        ...incident.timeline,
        this.#entry(incident.timeline.length + 1, at, "recovery-checks-passed", { reportPointer: input.verification.check.reportPointer }),
        this.#entry(incident.timeline.length + 2, at, "failed-deployment-quarantined", { failedDeploymentId: failed.id }),
        this.#entry(incident.timeline.length + 3, at, "notification-recorded", { kind: "automatic-rollback" }),
      ],
    };
    this.#incidents.set(updated.id, updated);
    this.#recordNotification(updated, "automatic-rollback", at, []);
    return clone(updated);
  }

  async escalate(input: { incidentId: string; providerDeploymentId: string; verification: RecoveryVerification | null; reason: string; now: Date }): Promise<RecoveryIncident> {
    const incident = this.#requiredIncident(input.incidentId);
    if (incident.status === "recovered" || incident.status === "escalated") return clone(incident);
    const observed = [...this.#deployments.values()].find(({ providerDeploymentId }) => providerDeploymentId === input.providerDeploymentId);
    if (observed) this.#servedDeploymentId = observed.id;
    const failed = this.#deployments.get(incident.failedDeploymentId)!;
    this.#deployments.set(failed.id, { ...failed, state: "quarantined" });
    const at = input.now.toISOString();
    const updated: RecoveryIncident = {
      ...incident,
      status: "escalated",
      providerObservedDeploymentId: input.providerDeploymentId,
      verificationReportPointer: input.verification?.check.reportPointer ?? null,
      verification: clone(input.verification),
      timeline: [
        ...incident.timeline,
        this.#entry(incident.timeline.length + 1, at, "recovery-checks-failed", { reason: input.reason, reportPointer: input.verification?.check.reportPointer ?? null }),
        this.#entry(incident.timeline.length + 2, at, "failed-deployment-quarantined", { failedDeploymentId: failed.id }),
        this.#entry(incident.timeline.length + 3, at, "notification-recorded", { kind: "rollback-failure" }),
      ],
    };
    this.#incidents.set(updated.id, updated);
    this.#recordNotification(updated, "rollback-failure", at, [
      "Keep the publication breaker open.",
      "Inspect provider routing before any manual route change.",
      "Select a retained Valid deployment and verify its public hashes and recovery checks.",
      "Reconcile provider, database, outbox, and notification state before breaker clearance.",
    ]);
    return clone(updated);
  }

  async clearBreaker(input: { servedDeploymentId: string; reportPointer: string; now: Date }): Promise<BreakerState> {
    const served = this.#deployments.get(input.servedDeploymentId);
    if (!served || served.state !== "valid") throw new Error("served-deployment-not-valid");
    if (served.id !== this.#servedDeploymentId) throw new Error("served-deployment-state-stale");
    this.#breaker = { state: "closed", failingDeploymentId: null, reason: null, openedAt: this.#breaker.openedAt, clearedAt: input.now.toISOString() };
    return clone(this.#breaker);
  }

  async snapshot(): Promise<RecoverySnapshot> {
    return clone({
      servedDeploymentId: this.#servedDeploymentId,
      deployments: [...this.#deployments.values()],
      breaker: this.#breaker,
      incidents: [...this.#incidents.values()],
      outbox: [...this.#outbox.values()],
      notifications: [...this.#notifications.values()],
    });
  }

  async leaseNextNotification(owner: string, now: Date, expiresAt: Date) {
    const outbox = [...this.#outbox.values()].find((entry) => entry.effect === "notification" && (entry.state === "pending"
      || (entry.state === "leased" && entry.leaseExpiresAt !== null && new Date(entry.leaseExpiresAt).getTime() <= now.getTime())));
    if (!outbox) return null;
    const notification = [...this.#notifications.values()].find(({ incidentId }) => incidentId === outbox.incidentId);
    if (!notification) throw new Error("recovery-notification-ledger-missing");
    const leased: RecoveryOutboxRecord = { ...outbox, state: "leased", attempts: outbox.attempts + 1, leaseOwner: owner, leaseExpiresAt: expiresAt.toISOString() };
    this.#outbox.set(leased.id, leased);
    return { notification: clone(notification), outbox: clone(leased) };
  }

  async notificationDelivered(input: { notificationId: string; outboxId: string; owner: string; providerMessageId: string }) {
    const notification = this.#notifications.get(input.notificationId);
    const outbox = this.#outbox.get(input.outboxId);
    if (!notification || !outbox || outbox.state !== "leased" || outbox.leaseOwner !== input.owner) throw new Error("recovery-notification-lease-not-owned");
    if (notification.state === "delivered") {
      if (notification.providerMessageId !== input.providerMessageId) throw new Error("recovery-notification-provider-id-conflict");
      return clone(notification);
    }
    const delivered: NotificationLedgerRecord = { ...notification, state: "delivered", providerMessageId: input.providerMessageId };
    this.#notifications.set(delivered.id, delivered);
    this.#outbox.set(outbox.id, { ...outbox, state: "applied", leaseOwner: null, leaseExpiresAt: null, providerReference: input.providerMessageId });
    const incident = this.#incidents.get(delivered.incidentId);
    if (incident?.operator) {
      this.#incidents.set(incident.id, { ...incident, operator: { ...incident.operator, notificationState: "delivered" } });
    }
    return clone(delivered);
  }

  async releaseNotification(input: { outboxId: string; owner: string; terminal: boolean }): Promise<void> {
    const outbox = this.#outbox.get(input.outboxId);
    if (!outbox || outbox.state !== "leased" || outbox.leaseOwner !== input.owner) throw new Error("recovery-notification-lease-not-owned");
    this.#outbox.set(outbox.id, { ...outbox, state: input.terminal ? "failed" : "pending", leaseOwner: null, leaseExpiresAt: null });
    if (input.terminal) {
      const notification = [...this.#notifications.values()].find(({ incidentId }) => incidentId === outbox.incidentId);
      if (notification) this.#notifications.set(notification.id, { ...notification, state: "failed" });
      const incident = this.#incidents.get(outbox.incidentId);
      if (incident?.operator) this.#incidents.set(incident.id, { ...incident, operator: { ...incident.operator, notificationState: "failed" } });
    }
  }

  async beginManualRestore(input: { deploymentId: string; reason: string; actor: string; now: Date }) {
    const target = this.#deployments.get(input.deploymentId);
    if (!target || target.state !== "valid") throw new Error("manual-restore-target-not-valid");
    const incidentId = `manual-restore:${target.id}:${sha256(input.reason).slice(7, 23)}`;
    const idempotencyKey = `rollback:${incidentId}`;
    if (!this.#outbox.has(`outbox:${idempotencyKey}`)) {
      this.#outbox.set(`outbox:${idempotencyKey}`, { id: `outbox:${idempotencyKey}`, incidentId, effect: "rollback", idempotencyKey, state: "pending", attempts: 0, leaseOwner: null, leaseExpiresAt: null, providerReference: null });
    }
    if (!this.#incidents.has(incidentId)) {
      this.#incidents.set(incidentId, {
        id: incidentId,
        failedDeploymentId: this.#servedDeploymentId,
        targetDeploymentId: target.id,
        failure: null,
        evidence: [],
        status: "routing",
        restoreAttemptedAt: input.now.toISOString(),
        providerObservedDeploymentId: null,
        verificationReportPointer: null,
        verification: null,
        operator: {
          actor: input.actor,
          reason: input.reason,
          selectedDeploymentId: target.id,
          outcome: "pending",
          notificationState: "not-required",
        },
        timeline: [this.#entry(1, input.now.toISOString(), "rollback-intent-recorded", { targetDeploymentId: target.id, manual: true, actor: input.actor, reason: input.reason })],
      });
    }
    if (this.#breaker.state !== "open") this.#breaker = { state: "open", failingDeploymentId: null, reason: `manual-restore:${input.reason}`, openedAt: input.now.toISOString(), clearedAt: null };
    return { incidentId, idempotencyKey };
  }

  async manualRestoreObserved(input: { incidentId: string; deploymentId: string; providerDeploymentId: string; providerReference: string; verification: RecoveryVerification; now: Date }): Promise<void> {
    const target = this.#deployments.get(input.deploymentId);
    if (!target || target.state !== "valid" || target.providerDeploymentId !== input.providerDeploymentId) throw new Error("manual-restore-target-not-valid");
    this.#servedDeploymentId = target.id;
    const outbox = this.#outbox.get(`outbox:rollback:${input.incidentId}`);
    if (!outbox) throw new Error("manual-restore-outbox-missing");
    this.#outbox.set(outbox.id, { ...outbox, state: "applied", providerReference: input.providerReference });
    const incident = this.#requiredIncident(input.incidentId);
    if (incident.status === "recovered") return;
    this.#incidents.set(input.incidentId, {
      ...incident,
      status: "recovered",
      providerObservedDeploymentId: input.providerDeploymentId,
      verificationReportPointer: input.verification.check.reportPointer,
      verification: clone(input.verification),
      operator: incident.operator ? { ...incident.operator, outcome: "recovered", notificationState: "not-required" } : null,
      timeline: [
        ...incident.timeline,
        this.#entry(incident.timeline.length + 1, input.now.toISOString(), "provider-routing-observed", { providerDeploymentId: input.providerDeploymentId, manual: true }),
        this.#entry(incident.timeline.length + 2, input.now.toISOString(), "recovery-checks-passed", { reportPointer: input.verification.check.reportPointer, manual: true }),
      ],
    });
  }

  async manualRestoreFailed(input: { incidentId: string; failureReason: string; providerDeploymentId: string | null; verification: RecoveryVerification | null; now: Date }): Promise<void> {
    const existing = this.#requiredIncident(input.incidentId);
    if (existing.status === "escalated") return;
    const at = input.now.toISOString();
    const incident: RecoveryIncident = {
      ...existing,
      status: "escalated",
      providerObservedDeploymentId: input.providerDeploymentId,
      verificationReportPointer: input.verification?.check.reportPointer ?? null,
      verification: clone(input.verification),
      operator: existing.operator ? { ...existing.operator, outcome: "failed", notificationState: "pending" } : null,
      timeline: [
        ...existing.timeline,
        this.#entry(existing.timeline.length + 1, at, "recovery-checks-failed", { reason: input.failureReason, manual: true }),
        this.#entry(existing.timeline.length + 2, at, "notification-recorded", { kind: "rollback-failure", manual: true }),
      ],
    };
    this.#incidents.set(incident.id, incident);
    this.#recordNotification(incident, "rollback-failure", at, [
      "Keep the publication breaker open.",
      "Inspect provider routing before any manual route change.",
      "Select a retained Valid deployment and verify its public hashes and recovery checks.",
      "Reconcile provider, database, outbox, and notification state before breaker clearance.",
    ]);
  }

  #recordNotification(incident: RecoveryIncident, kind: NotificationKind, at: string, manualSteps: readonly string[]) {
    const idempotencyKey = `notification:${kind}:${incident.id}`;
    const id = `notification:${sha256(idempotencyKey).slice(7, 31)}`;
    if (this.#notifications.has(id)) return;
    const subject = kind === "automatic-rollback" ? "Portfolio restored after objective failure" : "Portfolio rollback failed — manual recovery required";
    const details = kind === "automatic-rollback"
      ? `${incident.failedDeploymentId} was quarantined; ${incident.targetDeploymentId} is served and the publication breaker remains open.`
      : `Automatic recovery did not verify. Keep the breaker open and reconcile provider routing before manual restore.`;
    this.#notifications.set(id, { id, incidentId: incident.id, kind, idempotencyKey, state: "pending", providerMessageId: null, createdAt: at, subject, details, manualSteps: clone(manualSteps) });
    this.#outbox.set(`outbox:${idempotencyKey}`, { id: `outbox:${idempotencyKey}`, incidentId: incident.id, effect: "notification", idempotencyKey, state: "pending", attempts: 0, leaseOwner: null, leaseExpiresAt: null, providerReference: null });
  }

  #requiredIncident(id: string): RecoveryIncident {
    const incident = this.#incidents.get(id);
    if (!incident) throw new Error("recovery-incident-missing");
    return incident;
  }

  #entry(sequence: number, at: string, event: RecoveryTimelineEntry["event"], details: RecoveryTimelineEntry["details"]): RecoveryTimelineEntry {
    return { sequence, at, event, details: clone(details) };
  }
}

export { ManualRestoreCoordinator, RecoveryCoordinator } from "./coordinator";

export { FailClosedRecoveryProvider, InMemoryRecoveryProvider } from "./adapters";
