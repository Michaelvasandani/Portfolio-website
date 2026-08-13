import type {
  CandidatePackageStore,
  DeploymentRecord,
  DeploymentProvider,
  OperationalEffectProvider,
  PublicationChecks,
  PublicationClock,
  PublicationInput,
} from "./contracts";
import { requiredProductionCheckerIds } from "./contracts";
import { immutableTargetIdentity } from "../publication-checks/preview";
import { canonicalJson, sha256 } from "../github/canonical";
import { publicationCheckInventory } from "../publication-checks/checkers";
import type { PublicationStore } from "./store";

type Dependencies = {
  store: PublicationStore;
  packages: CandidatePackageStore;
  deployments: DeploymentProvider;
  checks: PublicationChecks;
  operationalEffects?: OperationalEffectProvider;
  clock?: PublicationClock;
  leaseMilliseconds?: number;
  maximumAttempts?: number;
  credentialLifetimeMilliseconds?: number;
  promotionGate?: { assertPromotionAllowed(candidateHash: PublicationInput["candidate"]["candidateHash"]): Promise<void> };
};

export class PublicationOrchestrator {
  readonly #store: PublicationStore;
  readonly #clock: PublicationClock;
  readonly #leaseMilliseconds: number;
  readonly #maximumAttempts: number;
  readonly #credentialLifetimeMilliseconds: number;

  constructor(private readonly dependencies: Dependencies) {
    this.#store = dependencies.store;
    this.#clock = dependencies.clock ?? { now: () => new Date() };
    this.#leaseMilliseconds = dependencies.leaseMilliseconds ?? 30_000;
    this.#maximumAttempts = dependencies.maximumAttempts ?? 3;
    this.#credentialLifetimeMilliseconds = dependencies.credentialLifetimeMilliseconds ?? 60_000;
  }

  trigger(input: PublicationInput) {
    return this.#store.createOrCoalesce(input, this.#clock.now());
  }

  async advance(runId: string, worker: string) {
    const now = this.#clock.now();
    const leased = await this.#store.leaseRun(runId, worker, now, new Date(now.getTime() + this.#leaseMilliseconds));
    if (!leased) return null;
    if (leased.phase === "queued") {
      return await this.#store.compareAndSwap(runId, leased.version, worker, { phase: "packaging", checkpoint: { phase: "packaging" }, releaseLease: true }, this.#clock.now());
    }
    const attempted = await this.#store.recordAttempt(runId, leased.version, worker, leased.phase, this.#clock.now());
    if (!attempted) return null;
    try {
      switch (attempted.phase) {
        case "packaging": return await this.#package(attempted, worker);
        case "deploying-preview": return await this.#deployPreview(attempted, worker);
        case "validating-preview": return await this.#validatePreview(attempted, worker);
        case "promoting": return await this.#promote(attempted, worker);
        case "verifying-production": return await this.#verifyProduction(attempted, worker);
        case "finalizing": {
          if (attempted.checkpoint.phase !== "finalizing") throw new Error("publication-checkpoint-phase-mismatch");
          return await this.#store.finalizeValid({ runId, expectedVersion: attempted.version, owner: worker, deploymentId: attempted.checkpoint.deploymentId, now: this.#clock.now() });
        }
        default: return attempted;
      }
    } catch (error) {
      const attempts = attempted.attempts[attempted.phase] ?? 0;
      if (attempts >= this.#maximumAttempts) {
        return await this.#store.rejectRun(runId, attempted.version, worker, `bounded-retries-exhausted:${attempted.phase}`, this.#clock.now());
      }
      const released = await this.#store.compareAndSwap(runId, attempted.version, worker, { releaseLease: true }, this.#clock.now());
      if (!released) throw error;
      return released;
    }
  }

  async sweep(input: { lastGithubCollectionAt: Date; maximumScheduleAgeMilliseconds: number }) {
    const now = this.#clock.now();
    const leases = await this.#store.sweep(now, this.#maximumAttempts);
    const missedSchedule = now.getTime() - input.lastGithubCollectionAt.getTime() > input.maximumScheduleAgeMilliseconds;
    if (missedSchedule) {
      await this.#store.enqueueEffect(
        "github-collection:schedule",
        "notification",
        `missed-github-collection:${input.lastGithubCollectionAt.toISOString()}`,
        now,
      );
    }
    return {
      ...leases,
      missedSchedule,
    };
  }

  async dispatchNextEffect(worker: string) {
    if (!this.dependencies.operationalEffects) throw new Error("operational-effect-provider-unavailable");
    const now = this.#clock.now();
    const effect = await this.#store.leaseNextEffect(worker, now, new Date(now.getTime() + this.#leaseMilliseconds));
    if (!effect) return null;
    const kind = effect.effect;
    if (kind !== "raw-deletion" && kind !== "cleanup" && kind !== "notification") throw new Error("unsupported-operational-effect");
    try {
      const reconciled = await this.dependencies.operationalEffects.read(kind, effect.idempotencyKey);
      const result = reconciled ?? await this.dependencies.operationalEffects.apply(kind, effect.idempotencyKey);
      return await this.#store.markEffectApplied(effect.id, result.providerReference, this.#clock.now(), worker);
    } catch {
      if (effect.attempts >= this.#maximumAttempts) {
        return await this.#store.failEffect(effect.id, worker, this.#clock.now());
      }
      return await this.#store.releaseEffect(effect.id, worker, this.#clock.now());
    }
  }

  async #package(run: Awaited<ReturnType<PublicationStore["readRun"]>> & {}, worker: string) {
    const key = `candidate-package:${run.input.candidate.candidateHash}`;
    const effect = await this.#store.enqueueEffect(run.id, "candidate-package", key, this.#clock.now());
    const existing = await this.dependencies.packages.find(run.input.candidate.candidateHash);
    if (existing && existing.bytesHash !== run.input.candidate.bytesHash) throw new Error("candidate-package-checkpoint-mismatch");
    const stored = existing ?? await this.dependencies.packages.put(run.input.candidate, key);
    await this.#store.markEffectApplied(effect.id, stored.packageId, this.#clock.now());
    return await this.#store.compareAndSwap(run.id, run.version, worker, {
      phase: "deploying-preview", checkpoint: { phase: "deploying-preview", packageId: stored.packageId }, releaseLease: true,
    }, this.#clock.now());
  }

  async #deployPreview(run: Awaited<ReturnType<PublicationStore["readRun"]>> & {}, worker: string) {
    if (run.checkpoint.phase !== "deploying-preview") throw new Error("publication-checkpoint-phase-mismatch");
    const key = `deployment:${run.id}:${run.input.candidate.candidateHash}`;
    const effect = await this.#store.enqueueEffect(run.id, "deployment", key, this.#clock.now());
    let preview = await this.dependencies.deployments.findPreview(key);
    if (!preview) {
      const expiresAt = new Date(this.#clock.now().getTime() + this.#credentialLifetimeMilliseconds).toISOString();
      const credential = await this.dependencies.packages.issueBuildCredential({
        packageId: run.checkpoint.packageId, candidateHash: run.input.candidate.candidateHash, expiresAt,
      });
      preview = await this.dependencies.deployments.createPreview({
        idempotencyKey: key, commit: run.input.codeCommit, packageId: run.checkpoint.packageId, credential: credential.token,
        candidateHash: run.input.candidate.candidateHash,
      });
    }
    this.#assertPreviewIdentity(run.input, preview);
    const deployment: DeploymentRecord = {
      id: `deployment:${preview.providerDeploymentId}`,
      providerDeploymentId: preview.providerDeploymentId,
      runId: run.id,
      publicationManifestId: `manifest:${run.id}`,
      candidateHash: preview.candidateHash,
      manifestHash: preview.manifestHash,
      publicOutputHash: preview.publicOutputHash,
      origin: preview.origin,
      state: "preview",
      precedingValidDeploymentId: (await this.#store.snapshot()).lastValidDeploymentId,
    };
    await this.#store.saveDeployment(deployment);
    await this.#store.markEffectApplied(effect.id, preview.providerDeploymentId, this.#clock.now());
    return await this.#store.compareAndSwap(run.id, run.version, worker, {
      phase: "validating-preview", checkpoint: { phase: "validating-preview", packageId: run.checkpoint.packageId, deploymentId: deployment.id, providerDeploymentId: preview.providerDeploymentId }, releaseLease: true,
    }, this.#clock.now());
  }

  async #validatePreview(run: Awaited<ReturnType<PublicationStore["readRun"]>> & {}, worker: string) {
    if (run.checkpoint.phase !== "validating-preview") throw new Error("publication-checkpoint-phase-mismatch");
    const key = `deployment:${run.id}:${run.input.candidate.candidateHash}`;
    const preview = await this.dependencies.deployments.findPreview(key);
    if (!preview) throw new Error("preview-provider-state-missing");
    this.#assertPreviewIdentity(run.input, preview);
    const report = await this.dependencies.checks.preview({
      candidate: {
        id: run.input.candidate.id,
        hashes: { candidateHash: run.input.candidate.candidateHash, publicOutputHash: run.input.candidate.publicOutputHash },
        publicManifestHash: run.input.candidate.manifestHash,
      },
      preview,
    });
    const evidenceMatches = report.evidence.deploymentId === preview.deploymentId
      && report.evidence.candidateHash === run.input.candidate.candidateHash
      && report.evidence.manifestHash === run.input.candidate.manifestHash
      && report.evidence.publicOutputHash === run.input.candidate.publicOutputHash;
    const targetIdentity = immutableTargetIdentity({ candidate: { id: run.input.candidate.id, hashes: { candidateHash: run.input.candidate.candidateHash, publicOutputHash: run.input.candidate.publicOutputHash }, publicManifestHash: run.input.candidate.manifestHash }, preview });
    const previewRequestedAt = new Date(run.updatedAt).getTime();
    const previewObservedAt = this.#clock.now().getTime();
    const configuredPreview = publicationCheckInventory.every(({ id, version }) => run.input.checkerVersions[id] === version && report.checks.filter(({ checkerId }) => checkerId === id).length === 1)
      && Object.keys(run.input.checkerVersions).length === publicationCheckInventory.length;
    const pinnedEvidence = configuredPreview && report.checks.every((check) => check.targetIdentity === targetIdentity
      && check.configurationHash === run.input.checkerConfigurationHashes.publication
      && run.input.checkerVersions[check.checkerId] === check.checkerVersion
      && new Date(check.startedAt).getTime() >= previewRequestedAt && new Date(check.finishedAt).getTime() <= previewObservedAt
      && new Date(check.finishedAt).getTime() >= new Date(check.startedAt).getTime()
      && check.integrity === "valid" && check.outcome !== "blocked" && this.#validAttempts(check.attempts, check.integrity));
    if (report.outcome === "blocked" || !evidenceMatches || !pinnedEvidence) {
      return await this.#store.rejectPreview({
        runId: run.id, expectedVersion: run.version, owner: worker, deploymentId: run.checkpoint.deploymentId, diagnostics: report,
        reason: report.outcome === "blocked" ? "preview-checks-blocked" : !evidenceMatches ? "preview-check-identity-mismatch" : "preview-check-evidence-unpinned",
        now: this.#clock.now(),
      });
    }
    return await this.#store.compareAndSwap(run.id, run.version, worker, { phase: "promoting", checkpoint: { ...run.checkpoint, phase: "promoting", previewValidation: report }, releaseLease: true }, this.#clock.now());
  }

  async #promote(run: Awaited<ReturnType<PublicationStore["readRun"]>> & {}, worker: string) {
    if (run.checkpoint.phase !== "promoting") throw new Error("publication-checkpoint-phase-mismatch");
    await this.dependencies.promotionGate?.assertPromotionAllowed(run.input.candidate.candidateHash);
    const providerDeploymentId = run.checkpoint.providerDeploymentId;
    const key = `promotion:${run.id}:${providerDeploymentId}`;
    const effect = await this.#store.enqueueEffect(run.id, "promotion", key, this.#clock.now());
    let promoted = await this.dependencies.deployments.promotionState(key);
    if (!promoted) promoted = await this.dependencies.deployments.promote({ idempotencyKey: key, providerDeploymentId });
    if (promoted.providerDeploymentId !== providerDeploymentId) return await this.#store.rejectRun(run.id, run.version, worker, "promotion-deployment-identity-mismatch", this.#clock.now());
    const deployment = await this.#store.readDeployment(run.id);
    if (!deployment) throw new Error("deployment-record-missing");
    await this.#store.saveDeployment({ ...deployment, state: "promoted" });
    await this.#store.markEffectApplied(effect.id, providerDeploymentId, this.#clock.now());
    return await this.#store.compareAndSwap(run.id, run.version, worker, {
      phase: "verifying-production", checkpoint: { ...run.checkpoint, phase: "verifying-production", nextProductionCheckAt: null, previewValidation: run.checkpoint.previewValidation }, releaseLease: true,
    }, this.#clock.now());
  }

  async #verifyProduction(run: Awaited<ReturnType<PublicationStore["readRun"]>> & {}, worker: string) {
    if (run.checkpoint.phase !== "verifying-production") throw new Error("publication-checkpoint-phase-mismatch");
    const first = run.productionPasses[0];
    const dueAt = first ? new Date(first.checkedAt).getTime() + run.productionPasses.length * 45_000 : Number.NEGATIVE_INFINITY;
    if (this.#clock.now().getTime() < dueAt) {
      return await this.#store.compareAndSwap(run.id, run.version, worker, {
        checkpoint: { ...run.checkpoint, nextProductionCheckAt: new Date(dueAt).toISOString() }, releaseLease: true,
      }, this.#clock.now());
    }
    const requestedAt = this.#clock.now().toISOString();
    const target = {
      providerDeploymentId: run.checkpoint.providerDeploymentId,
      candidateHash: run.input.candidate.candidateHash,
      manifestHash: run.input.candidate.manifestHash,
      publicOutputHash: run.input.candidate.publicOutputHash,
      requestedAt,
      observationIdentity: sha256(canonicalJson({ runId: run.id, pass: run.productionPasses.length + 1, requestedAt })),
    };
    const report = await this.dependencies.checks.production(target);
    if (report.outcome === "blocked") {
      const recorded = await this.#store.compareAndSwap(run.id, run.version, worker, { productionDiagnostics: [...run.productionDiagnostics, report] }, this.#clock.now());
      return recorded ? await this.#store.rejectRun(run.id, recorded.version, worker, `production-checks-blocked:${report.reason}`, this.#clock.now()) : null;
    }
    const pass = report.pass;
    const matches = pass.deploymentId === target.providerDeploymentId && pass.candidateHash === target.candidateHash
      && pass.manifestHash === target.manifestHash && pass.publicOutputHash === target.publicOutputHash;
    const observedAt = this.#clock.now().toISOString();
    const complete = requiredProductionCheckerIds.every((id) => pass.checks.filter(({ checkerId }) => checkerId === id).length === 1)
      && pass.checks.every((check) => check.integrity === "valid" && check.outcome !== "blocked" && check.reportPointer
        && check.configurationHash === run.input.checkerConfigurationHashes.publication
        && run.input.checkerVersions[check.checkerId] === check.checkerVersion
        && check.targetIdentity === target.observationIdentity
        && new Date(check.startedAt).getTime() >= new Date(target.requestedAt).getTime()
        && new Date(check.finishedAt).getTime() <= new Date(observedAt).getTime()
        && new Date(check.finishedAt).getTime() >= new Date(check.startedAt).getTime()
        && this.#validAttempts(check.attempts, check.integrity));
    if (!matches || !complete) return await this.#store.rejectRun(run.id, run.version, worker, matches ? "production-check-incomplete" : "production-check-identity-mismatch", this.#clock.now());
    const passes = [...run.productionPasses, { ...pass, checkedAt: observedAt }];
    return await this.#store.compareAndSwap(run.id, run.version, worker, {
      phase: passes.length === 3 ? "finalizing" : "verifying-production",
      productionPasses: passes,
      checkpoint: { ...run.checkpoint, phase: passes.length === 3 ? "finalizing" : "verifying-production", nextProductionCheckAt: passes.length === 3 ? null : new Date(new Date(passes[0]!.checkedAt).getTime() + passes.length * 45_000).toISOString() },
      releaseLease: true,
    }, this.#clock.now());
  }

  #assertPreviewIdentity(input: PublicationInput, preview: Awaited<ReturnType<DeploymentProvider["createPreview"]>>) {
    if (!preview.zeroTraffic || !preview.productionShaped || preview.deploymentId !== preview.providerDeploymentId
      || preview.candidateHash !== input.candidate.candidateHash || preview.manifestHash !== input.candidate.manifestHash
      || preview.publicOutputHash !== input.candidate.publicOutputHash) {
      throw new Error("preview-identity-mismatch");
    }
  }

  #validAttempts(attempts: readonly { attempt: number; cleanEnvironmentId: string; integrity: string; reportPointer: string | null }[], finalIntegrity: string) {
    if (attempts.length < 1 || attempts.length > 3 || finalIntegrity !== "valid") return false;
    if (new Set(attempts.map(({ cleanEnvironmentId }) => cleanEnvironmentId)).size !== attempts.length) return false;
    return attempts.every((attempt, index) => attempt.attempt === index + 1 && (index < attempts.length - 1 || (attempt.integrity === "valid" && Boolean(attempt.reportPointer))));
  }

}
