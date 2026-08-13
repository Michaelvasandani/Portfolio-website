import { AmbiguousProviderResultError, type PublicationClock } from "../publication/contracts";
import type { Sha256 } from "../publication-checks/contracts";
import { classifyObjectiveFailure } from "./failure-policy";
import type { BreakerState, ProductionFailureObservation, RecoveryIncident, RecoveryProvider, RecoveryStore, RecoveryVerification } from "./service";

const recoveryEvidenceMaximumAgeMilliseconds = 300_000;

export function verificationMatchesDeployment(verification: RecoveryVerification, deployment: Parameters<RecoveryProvider["verify"]>[0]): boolean {
  return verification.providerDeploymentId === deployment.providerDeploymentId
    && verification.candidateHash === deployment.candidateHash
    && verification.manifestHash === deployment.manifestHash
    && verification.publicOutputHash === deployment.publicOutputHash;
}

export function recoveryEvidenceIsValid(verification: RecoveryVerification, deploymentId: string, now: Date): boolean {
  const check = verification.check;
  if (!check || check.checkerId.trim() === "" || check.checkerVersion.trim() === ""
    || !/^sha256:[a-f0-9]{64}$/.test(check.rulesHash)
    || !/^sha256:[a-f0-9]{64}$/.test(check.configurationHash)
    || check.environment.runner.trim() === "" || check.environment.image.trim() === "" || check.environment.cleanEnvironmentId.trim() === ""
    || check.target !== deploymentId || check.reportPointer.trim() === ""
    || Object.keys(check.measurements).length === 0 || !Array.isArray(check.retryHistory)
    || check.retryHistory.length > 2 || check.retryHistory.some((identity) => identity.trim() === "")
    || new Set(check.retryHistory).size !== check.retryHistory.length) return false;
  const startedAt = Date.parse(check.startedAt);
  const finishedAt = Date.parse(check.finishedAt);
  return Number.isFinite(startedAt) && Number.isFinite(finishedAt)
    && startedAt <= finishedAt
    && finishedAt <= now.getTime()
    && now.getTime() - finishedAt <= recoveryEvidenceMaximumAgeMilliseconds;
}

export class RecoveryCoordinator {
  readonly #clock: PublicationClock;
  constructor(private readonly dependencies: { store: RecoveryStore; provider: RecoveryProvider; clock?: PublicationClock }) {
    this.#clock = dependencies.clock ?? { now: () => new Date() };
  }

  async recover(observations: readonly ProductionFailureObservation[]): Promise<RecoveryIncident> {
    const failure = classifyObjectiveFailure(observations);
    if (!failure) throw new Error("objective-recovery-threshold-not-met");
    const failedDeploymentId = observations.at(-1)!.deploymentId;
    let incident = await this.dependencies.store.begin({ failedDeploymentId, failure, evidence: observations, now: this.#clock.now() });
    if (incident.status === "recovered" || incident.status === "escalated") return incident;
    const snapshot = await this.dependencies.store.snapshot();
    const target = snapshot.deployments.find(({ id }) => id === incident.targetDeploymentId);
    if (!target || target.state !== "valid") throw new Error("recovery-target-not-valid");
    if (incident.status === "routing") {
      const idempotencyKey = `rollback:${incident.id}`;
      let routed: { providerDeploymentId: string; providerReference: string };
      try {
        routed = await this.dependencies.provider.route({ idempotencyKey, providerDeploymentId: target.providerDeploymentId });
      } catch (error) {
        let observed: { providerDeploymentId: string };
        try {
          observed = await this.dependencies.provider.readRouting();
        } catch {
          return await this.dependencies.store.escalate({ incidentId: incident.id, providerDeploymentId: "provider-state-unavailable", verification: null, reason: "rollback-provider-read-failed", now: this.#clock.now() });
        }
        routed = { providerDeploymentId: observed.providerDeploymentId, providerReference: `provider-read:${observed.providerDeploymentId}` };
        if (!(error instanceof AmbiguousProviderResultError) || observed.providerDeploymentId !== target.providerDeploymentId) {
          return await this.dependencies.store.escalate({ incidentId: incident.id, providerDeploymentId: observed.providerDeploymentId, verification: null, reason: "rollback-provider-state-mismatch", now: this.#clock.now() });
        }
      }
      incident = await this.dependencies.store.routingObserved({ incidentId: incident.id, ...routed, now: this.#clock.now() });
    }
    if (incident.providerObservedDeploymentId !== target.providerDeploymentId) {
      return await this.dependencies.store.escalate({ incidentId: incident.id, providerDeploymentId: incident.providerObservedDeploymentId ?? "unknown", verification: null, reason: "rollback-target-not-served", now: this.#clock.now() });
    }
    let verification: RecoveryVerification;
    try {
      verification = await this.dependencies.provider.verify(target, this.#clock.now());
    } catch {
      const observed = await this.#readRoutingOrUnknown();
      return await this.dependencies.store.escalate({ incidentId: incident.id, providerDeploymentId: observed, verification: null, reason: "recovery-check-execution-failed", now: this.#clock.now() });
    }
    const identityMatches = verificationMatchesDeployment(verification, target);
    const evidenceValid = recoveryEvidenceIsValid(verification, target.id, this.#clock.now());
    if (verification.check.outcome !== "passed" || !identityMatches || !evidenceValid) {
      const observed = await this.#readRoutingOrUnknown();
      const reason = !identityMatches ? "recovery-identity-mismatch" : !evidenceValid ? "recovery-evidence-invalid" : "recovery-checks-failed";
      return await this.dependencies.store.escalate({ incidentId: incident.id, providerDeploymentId: observed, verification, reason, now: this.#clock.now() });
    }
    return await this.dependencies.store.complete({ incidentId: incident.id, verification, now: this.#clock.now() });
  }

  async assertPromotionAllowed(candidateHash: Sha256): Promise<void> {
    const snapshot = await this.dependencies.store.snapshot();
    if (snapshot.deployments.some(({ state, candidateHash: quarantinedHash }) => state === "quarantined" && quarantinedHash === candidateHash)) throw new Error("quarantined-candidate-unchanged");
    if (snapshot.breaker.state === "open") throw new Error("publication-breaker-open");
  }

  async assertSourceCollectionAllowed(): Promise<void> {}

  async clearBreaker(): Promise<BreakerState> {
    const observed = await this.dependencies.provider.readRouting();
    const snapshot = await this.dependencies.store.snapshot();
    const served = snapshot.deployments.find(({ providerDeploymentId }) => providerDeploymentId === observed.providerDeploymentId);
    if (!served || served.state !== "valid") throw new Error("served-deployment-not-valid");
    const verification = await this.dependencies.provider.verify(served, this.#clock.now());
    if (verification.check.outcome !== "passed" || !verificationMatchesDeployment(verification, served)
      || !recoveryEvidenceIsValid(verification, served.id, this.#clock.now())) throw new Error("breaker-clearance-checks-failed");
    return await this.dependencies.store.clearBreaker({ servedDeploymentId: served.id, reportPointer: verification.check.reportPointer, now: this.#clock.now() });
  }

  async #readRoutingOrUnknown(): Promise<string> {
    try { return (await this.dependencies.provider.readRouting()).providerDeploymentId; }
    catch { return "provider-state-unavailable"; }
  }
}

export class ManualRestoreCoordinator {
  readonly #clock: PublicationClock;
  constructor(private readonly dependencies: { store: RecoveryStore; provider: RecoveryProvider; clock?: PublicationClock }) {
    this.#clock = dependencies.clock ?? { now: () => new Date() };
  }

  async restore(deploymentId: string, reason: string, actor = "owner") {
    if (reason.trim().length < 8) throw new Error("manual-restore-reason-required");
    const state = await this.dependencies.store.snapshot();
    const target = state.deployments.find(({ id }) => id === deploymentId);
    if (!target || target.state !== "valid") throw new Error("manual-restore-target-not-valid");
    const intent = await this.dependencies.store.beginManualRestore({ deploymentId, reason, actor, now: this.#clock.now() });
    let observed: { providerDeploymentId: string; providerReference: string };
    try {
      observed = await this.dependencies.provider.route({ idempotencyKey: intent.idempotencyKey, providerDeploymentId: target.providerDeploymentId });
    } catch (error) {
      let routed: { providerDeploymentId: string };
      try { routed = await this.dependencies.provider.readRouting(); }
      catch {
        await this.dependencies.store.manualRestoreFailed({ incidentId: intent.incidentId, failureReason: "manual-restore-provider-read-failed", providerDeploymentId: null, verification: null, now: this.#clock.now() });
        throw new Error("manual-restore-routing-failed");
      }
      observed = { ...routed, providerReference: `provider-read:${routed.providerDeploymentId}` };
      if (!(error instanceof AmbiguousProviderResultError) || routed.providerDeploymentId !== target.providerDeploymentId) {
        await this.dependencies.store.manualRestoreFailed({ incidentId: intent.incidentId, failureReason: "manual-restore-routing-failed", providerDeploymentId: routed.providerDeploymentId, verification: null, now: this.#clock.now() });
        throw new Error("manual-restore-routing-failed");
      }
    }
    if (observed.providerDeploymentId !== target.providerDeploymentId) {
      await this.dependencies.store.manualRestoreFailed({ incidentId: intent.incidentId, failureReason: "manual-restore-routing-mismatch", providerDeploymentId: observed.providerDeploymentId, verification: null, now: this.#clock.now() });
      throw new Error("manual-restore-routing-mismatch");
    }
    let verification: Awaited<ReturnType<RecoveryProvider["verify"]>>;
    try { verification = await this.dependencies.provider.verify(target, this.#clock.now()); }
    catch {
      await this.dependencies.store.manualRestoreFailed({ incidentId: intent.incidentId, failureReason: "manual-restore-check-execution-failed", providerDeploymentId: observed.providerDeploymentId, verification: null, now: this.#clock.now() });
      throw new Error("manual-restore-verification-failed");
    }
    const verified = verification.check.outcome === "passed"
      && verificationMatchesDeployment(verification, target)
      && recoveryEvidenceIsValid(verification, target.id, this.#clock.now());
    if (!verified) {
      await this.dependencies.store.manualRestoreFailed({ incidentId: intent.incidentId, failureReason: "manual-restore-verification-failed", providerDeploymentId: observed.providerDeploymentId, verification, now: this.#clock.now() });
      throw new Error("manual-restore-verification-failed");
    }
    await this.dependencies.store.manualRestoreObserved({ incidentId: intent.incidentId, deploymentId: target.id, providerDeploymentId: target.providerDeploymentId, providerReference: observed.providerReference, verification, now: this.#clock.now() });
    return { operationId: intent.idempotencyKey, deploymentId: target.id, providerDeploymentId: target.providerDeploymentId, verified };
  }
}
