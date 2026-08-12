import { canonicalJson, sha256 } from "../github/canonical";
import type {
  AuditRecord,
  DeploymentRecord,
  FinalizedPublication,
  FinalizedManifest,
  QualityBaseline,
  OutboxEffect,
  OutboxRecord,
  ProductionPass,
  ProductionCheckReport,
  PublicationCheckpoint,
  PublicationInput,
  PublicationRun,
  PublicationRunPhase,
  TerminalState,
} from "./contracts";
import { requiredProductionCheckerIds } from "./contracts";
import type { PublicationCheckRun } from "../publication-checks/contracts";

export type RunPatch = Readonly<{
  phase?: PublicationRunPhase;
  checkpoint?: PublicationCheckpoint;
  productionPasses?: readonly ProductionPass[];
  diagnostics?: readonly PublicationCheckRun[];
  productionDiagnostics?: readonly ProductionCheckReport[];
  terminal?: TerminalState;
  releaseLease?: boolean;
}>;

export interface PublicationStore {
  createOrCoalesce(input: PublicationInput, now: Date): Promise<PublicationRun>;
  readRun(id: string): Promise<PublicationRun | null>;
  listRuns(): Promise<readonly PublicationRun[]>;
  leaseRun(id: string, owner: string, now: Date, expiresAt: Date): Promise<PublicationRun | null>;
  compareAndSwap(id: string, version: number, owner: string, patch: RunPatch, now: Date): Promise<PublicationRun | null>;
  recordAttempt(id: string, version: number, owner: string, phase: PublicationRunPhase, now: Date): Promise<PublicationRun | null>;
  enqueueEffect(runId: string, effect: OutboxEffect, idempotencyKey: string, now: Date): Promise<OutboxRecord>;
  readEffect(runId: string, effect: OutboxEffect): Promise<OutboxRecord | null>;
  markEffectApplied(id: string, providerReference: string, now: Date, owner?: string): Promise<OutboxRecord>;
  leaseNextEffect(owner: string, now: Date, expiresAt: Date): Promise<OutboxRecord | null>;
  releaseEffect(id: string, owner: string, now: Date): Promise<OutboxRecord>;
  failEffect(id: string, owner: string, now: Date): Promise<OutboxRecord>;
  saveDeployment(deployment: DeploymentRecord): Promise<DeploymentRecord>;
  readDeployment(runId: string): Promise<DeploymentRecord | null>;
  rejectRun(id: string, expectedVersion: number, owner: string, reason: string, now: Date): Promise<PublicationRun | null>;
  rejectPreview(input: { runId: string; expectedVersion: number; owner: string; deploymentId: string; reason: string; diagnostics: PublicationCheckRun; now: Date }): Promise<PublicationRun | null>;
  finalizeValid(input: { runId: string; expectedVersion: number; owner: string; deploymentId: string; now: Date }): Promise<PublicationRun>;
  sweep(now: Date, maximumAttempts: number): Promise<{ releasedRunIds: string[]; terminalizedRunIds: string[]; releasedOutboxIds: string[]; failedOutboxIds: string[] }>;
  snapshot(): Promise<FinalizedPublication>;
}

/** PostgreSQL implements this transactional/CAS port in production; the in-memory store is its executable conformance harness. */

type MutableRun = {
  -readonly [K in keyof PublicationRun]: K extends "input" ? PublicationInput : PublicationRun[K];
};

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryPublicationStore implements PublicationStore {
  readonly #runs = new Map<string, MutableRun>();
  readonly #outbox = new Map<string, OutboxRecord>();
  readonly #deployments = new Map<string, DeploymentRecord>();
  readonly #manifests = new Map<string, FinalizedManifest>();
  readonly #audits = new Map<string, AuditRecord>();
  #lastValidDeploymentId: string | null = null;
  #qualityBaseline: QualityBaseline | null = null;
  #sequence = 0;

  async createOrCoalesce(input: PublicationInput, now: Date): Promise<PublicationRun> {
    const frozen = copy(input);
    const inputIdentity = sha256(canonicalJson(frozen));
    const duplicate = [...this.#runs.values()].find((run) => !run.terminal && sha256(canonicalJson(run.input)) === inputIdentity);
    if (duplicate) return copy(duplicate);
    if (input.trigger === "schedule") {
      for (const run of this.#runs.values()) {
        if (run.input.trigger === "schedule" && run.phase === "queued" && !run.terminal) {
          run.terminal = { kind: "superseded", reason: "newer-scheduled-input" };
          run.version += 1;
          run.updatedAt = now.toISOString();
          this.#audit(run.id, "publication-run-superseded", "warning", now, { byInput: inputIdentity });
        }
      }
    }
    const sequence = ++this.#sequence;
    const id = `run:${String(sequence).padStart(6, "0")}`;
    const run: MutableRun = {
      id,
      sequence,
      input: frozen,
      phase: "queued",
      version: 0,
      checkpoint: { phase: "queued" },
      lease: null,
      attempts: {},
      productionPasses: [],
      diagnostics: [],
      productionDiagnostics: [],
      terminal: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.#runs.set(id, run);
    this.#audit(id, "publication-run-created", "accepted", now, { trigger: input.trigger, inputIdentity });
    return copy(run);
  }

  async readRun(id: string) { return copy(this.#runs.get(id) ?? null); }
  async listRuns() { return copy([...this.#runs.values()].sort((a, b) => a.sequence - b.sequence)); }

  async leaseRun(id: string, owner: string, now: Date, expiresAt: Date): Promise<PublicationRun | null> {
    const run = this.#runs.get(id);
    if (!run || run.terminal) return null;
    const earlier = [...this.#runs.values()].some((candidate) => !candidate.terminal && candidate.sequence < run.sequence);
    if (earlier) return null;
    if (run.lease && new Date(run.lease.expiresAt).getTime() > now.getTime() && run.lease.owner !== owner) return null;
    run.lease = { owner, expiresAt: expiresAt.toISOString() };
    run.version += 1;
    run.updatedAt = now.toISOString();
    return copy(run);
  }

  async compareAndSwap(id: string, version: number, owner: string, patch: RunPatch, now: Date): Promise<PublicationRun | null> {
    const run = this.#runs.get(id);
    if (!run || run.version !== version || run.lease?.owner !== owner || run.terminal) return null;
    if (patch.phase && patch.phase !== run.phase) {
      const allowed: Record<PublicationRunPhase, PublicationRunPhase[]> = {
        queued: ["packaging"], packaging: ["deploying-preview"], "deploying-preview": ["validating-preview"],
        "validating-preview": ["promoting"], promoting: ["verifying-production"],
        "verifying-production": ["finalizing"], finalizing: [],
      };
      if (!allowed[run.phase].includes(patch.phase)) throw new Error(`invalid-publication-transition:${run.phase}:${patch.phase}`);
      const priorPhase = run.phase;
      run.phase = patch.phase;
      this.#audit(id, "publication-run-transition", "accepted", now, { from: priorPhase, to: patch.phase });
    }
    if (patch.checkpoint) run.checkpoint = copy(patch.checkpoint);
    else if (patch.phase) throw new Error("phase-transition-requires-checkpoint");
    if (patch.productionPasses) run.productionPasses = copy(patch.productionPasses);
    if (patch.diagnostics) run.diagnostics = copy(patch.diagnostics);
    if (patch.productionDiagnostics) run.productionDiagnostics = copy(patch.productionDiagnostics);
    if (patch.terminal) run.terminal = copy(patch.terminal);
    if (patch.releaseLease) run.lease = null;
    run.version += 1;
    run.updatedAt = now.toISOString();
    return copy(run);
  }

  async recordAttempt(id: string, version: number, owner: string, phase: PublicationRunPhase, now: Date): Promise<PublicationRun | null> {
    const run = this.#runs.get(id);
    if (!run || run.version !== version || run.lease?.owner !== owner || run.phase !== phase || run.terminal) return null;
    run.attempts = { ...run.attempts, [phase]: (run.attempts[phase] ?? 0) + 1 };
    run.version += 1;
    run.updatedAt = now.toISOString();
    return copy(run);
  }

  async enqueueEffect(runId: string, effect: OutboxEffect, idempotencyKey: string, now: Date): Promise<OutboxRecord> {
    const id = `outbox:${idempotencyKey}`;
    const existing = this.#outbox.get(id);
    if (existing) return copy(existing);
    const record: OutboxRecord = { id, runId, effect, idempotencyKey, state: "pending", attempts: 0, leaseOwner: null, leaseExpiresAt: null, providerReference: null };
    this.#outbox.set(id, record);
    this.#audit(runId, `outbox-${effect}-enqueued`, "accepted", now, { idempotencyKey });
    return copy(record);
  }

  async readEffect(runId: string, effect: OutboxEffect) {
    return copy([...this.#outbox.values()].find((record) => record.runId === runId && record.effect === effect) ?? null);
  }

  async markEffectApplied(id: string, providerReference: string, now: Date, owner?: string): Promise<OutboxRecord> {
    const record = this.#outbox.get(id);
    if (!record) throw new Error("outbox-record-not-found");
    if (record.state === "applied") {
      if (record.providerReference !== providerReference) throw new Error("outbox-provider-reference-conflict");
      return copy(record);
    }
    if (owner && (record.state !== "leased" || record.leaseOwner !== owner)) throw new Error("outbox-lease-not-owned");
    if (record.state === "failed") throw new Error("outbox-effect-terminal");
    const updated = { ...record, state: "applied" as const, providerReference, leaseOwner: null, leaseExpiresAt: null };
    this.#outbox.set(id, updated);
    this.#audit(record.runId, `outbox-${record.effect}-applied`, "accepted", now, { providerReference });
    return copy(updated);
  }

  async leaseNextEffect(owner: string, now: Date, expiresAt: Date): Promise<OutboxRecord | null> {
    const record = [...this.#outbox.values()].find((candidate) =>
      (candidate.effect === "raw-deletion" || candidate.effect === "cleanup" || candidate.effect === "notification")
      && (candidate.state === "pending" || (candidate.state === "leased" && candidate.leaseExpiresAt !== null && new Date(candidate.leaseExpiresAt).getTime() <= now.getTime())),
    );
    if (!record) return null;
    const leased: OutboxRecord = { ...record, state: "leased", attempts: record.attempts + 1, leaseOwner: owner, leaseExpiresAt: expiresAt.toISOString() };
    this.#outbox.set(record.id, leased);
    return copy(leased);
  }

  async releaseEffect(id: string, owner: string): Promise<OutboxRecord> {
    const record = this.#outbox.get(id);
    if (!record || record.state !== "leased" || record.leaseOwner !== owner) throw new Error("outbox-lease-not-owned");
    const released: OutboxRecord = { ...record, state: "pending", leaseOwner: null, leaseExpiresAt: null };
    this.#outbox.set(id, released);
    return copy(released);
  }

  async failEffect(id: string, owner: string, now: Date): Promise<OutboxRecord> {
    const record = this.#outbox.get(id);
    if (!record || record.state !== "leased" || record.leaseOwner !== owner) throw new Error("outbox-lease-not-owned");
    const failed: OutboxRecord = { ...record, state: "failed", leaseOwner: null, leaseExpiresAt: null };
    this.#outbox.set(id, failed);
    if (record.effect !== "notification") {
      await this.enqueueEffect(record.runId, "notification", `stuck-outbox:${record.id}`, now);
    }
    return copy(failed);
  }

  async saveDeployment(deployment: DeploymentRecord) {
    const prior = this.#deployments.get(deployment.id);
    if (prior) {
      const { state: priorState, ...priorIdentity } = prior;
      const { state: nextState, ...nextIdentity } = deployment;
      if (canonicalJson(priorIdentity) !== canonicalJson(nextIdentity)) throw new Error("immutable-deployment-conflict");
      const transitions: Record<DeploymentRecord["state"], DeploymentRecord["state"][]> = {
        preview: ["promoted", "rejected"], promoted: ["valid", "rejected"], valid: [], rejected: [],
      };
      if (priorState !== nextState && !transitions[priorState].includes(nextState)) throw new Error("invalid-deployment-transition");
    }
    this.#deployments.set(deployment.id, copy(deployment));
    return copy(this.#deployments.get(deployment.id)!);
  }

  async readDeployment(runId: string) {
    return copy([...this.#deployments.values()].find((deployment) => deployment.runId === runId) ?? null);
  }

  async rejectRun(id: string, expectedVersion: number, owner: string, reason: string, now: Date): Promise<PublicationRun | null> {
    const run = this.#runs.get(id);
    if (!run || run.version !== expectedVersion || run.lease?.owner !== owner || run.terminal) return null;
    if (!run.terminal) {
      run.terminal = { kind: "failed", reason };
      run.lease = null;
      run.version += 1;
      run.updatedAt = now.toISOString();
      this.#audit(id, "publication-run-failed", "rejected", now, { reason });
      await this.enqueueEffect(id, "raw-deletion", `transient-cleanup:${id}`, now);
      await this.enqueueEffect(id, "notification", `terminal-failure:${id}`, now);
    }
    return copy(run);
  }

  async rejectPreview(input: { runId: string; expectedVersion: number; owner: string; deploymentId: string; reason: string; diagnostics: PublicationCheckRun; now: Date }): Promise<PublicationRun | null> {
    const run = this.#runs.get(input.runId);
    const deployment = this.#deployments.get(input.deploymentId);
    if (!run || !deployment || run.version !== input.expectedVersion || run.lease?.owner !== input.owner || run.terminal || deployment.state !== "preview") return null;
    const runBefore = copy(run);
    const deploymentBefore = copy(deployment);
    const outboxBefore = copy([...this.#outbox.entries()]);
    const auditsBefore = copy([...this.#audits.entries()]);
    try {
      run.diagnostics = [...run.diagnostics, copy(input.diagnostics)];
      this.#deployments.set(deployment.id, { ...deployment, state: "rejected" });
      return await this.rejectRun(run.id, run.version, input.owner, input.reason, input.now);
    } catch (error) {
      this.#runs.set(run.id, runBefore); this.#deployments.set(deployment.id, deploymentBefore);
      this.#outbox.clear(); for (const [key, value] of outboxBefore) this.#outbox.set(key, value);
      this.#audits.clear(); for (const [key, value] of auditsBefore) this.#audits.set(key, value);
      throw error;
    }
  }

  async finalizeValid(input: { runId: string; expectedVersion: number; owner: string; deploymentId: string; now: Date }): Promise<PublicationRun> {
    const run = this.#runs.get(input.runId);
    const deployment = this.#deployments.get(input.deploymentId);
    if (!run || !deployment || run.version !== input.expectedVersion || run.lease?.owner !== input.owner || run.phase !== "finalizing") {
      throw new Error("finalize-compare-and-swap-failed");
    }
    if (run.productionPasses.length !== 3) throw new Error("production-pass-count-invalid");
    const span = new Date(run.productionPasses[2]!.checkedAt).getTime() - new Date(run.productionPasses[0]!.checkedAt).getTime();
    if (span < 90_000) throw new Error("production-observation-window-too-short");
    if (deployment.state !== "promoted") throw new Error("deployment-not-promoted");
    for (const pass of run.productionPasses) {
      const configured = requiredProductionCheckerIds.every((id) => pass.checks.filter(({ checkerId }) => checkerId === id).length === 1);
      if (!configured || pass.checks.some((check) => check.integrity !== "valid" || check.outcome === "blocked" || !check.reportPointer)) {
        throw new Error("production-pass-incomplete");
      }
    }
    if (run.checkpoint.phase !== "finalizing") throw new Error("finalization-checkpoint-invalid");
    const stateBefore = {
      run: copy(run), deployment: copy(deployment), lastValid: this.#lastValidDeploymentId,
      outbox: copy([...this.#outbox.entries()]), audits: copy([...this.#audits.entries()]), manifests: copy([...this.#manifests.entries()]), baseline: copy(this.#qualityBaseline),
    };
    try {
      this.#deployments.set(deployment.id, { ...deployment, state: "valid" });
      const manifest: FinalizedManifest = {
        id: deployment.publicationManifestId,
        runId: run.id,
        input: copy(run.input),
        deploymentId: deployment.id,
        providerDeploymentId: deployment.providerDeploymentId,
        packageId: run.checkpoint.packageId,
        bindings: copy(run.input.candidate.manifestBindings),
        previewValidation: copy(run.checkpoint.previewValidation),
        productionPasses: copy(run.productionPasses),
        finalizedAt: input.now.toISOString(),
      };
      this.#manifests.set(manifest.id, manifest);
      this.#qualityBaseline = {
        deploymentId: deployment.id,
        candidateHash: deployment.candidateHash,
        publicOutputHash: deployment.publicOutputHash,
        establishedAt: input.now.toISOString(),
      };
      this.#lastValidDeploymentId = deployment.id;
      run.terminal = { kind: "succeeded" };
      run.lease = null;
      run.version += 1;
      run.updatedAt = input.now.toISOString();
      await this.enqueueEffect(run.id, "cleanup", `retention:${run.id}`, input.now);
      this.#audit(run.id, "last-valid-advanced", "accepted", input.now, { deploymentId: deployment.id });
      return copy(run);
    } catch (error) {
      this.#runs.set(run.id, stateBefore.run);
      this.#deployments.set(deployment.id, stateBefore.deployment);
      this.#lastValidDeploymentId = stateBefore.lastValid;
      this.#outbox.clear(); for (const [key, value] of stateBefore.outbox) this.#outbox.set(key, value);
      this.#audits.clear(); for (const [key, value] of stateBefore.audits) this.#audits.set(key, value);
      this.#manifests.clear(); for (const [key, value] of stateBefore.manifests) this.#manifests.set(key, value);
      this.#qualityBaseline = stateBefore.baseline;
      throw error;
    }
  }

  async sweep(now: Date, maximumAttempts: number) {
    const releasedRunIds: string[] = [];
    const terminalizedRunIds: string[] = [];
    const releasedOutboxIds: string[] = [];
    const failedOutboxIds: string[] = [];
    for (const run of this.#runs.values()) {
      if (run.terminal || !run.lease || new Date(run.lease.expiresAt).getTime() > now.getTime()) continue;
      if ((run.attempts[run.phase] ?? 0) >= maximumAttempts) {
        const failed = await this.rejectRun(run.id, run.version, run.lease.owner, `bounded-retries-exhausted:${run.phase}`, now);
        if (failed) terminalizedRunIds.push(run.id);
      } else {
        run.lease = null;
        run.version += 1;
        run.updatedAt = now.toISOString();
        releasedRunIds.push(run.id);
      }
    }
    for (const [id, record] of this.#outbox) {
      if (record.state !== "leased" || !record.leaseExpiresAt || new Date(record.leaseExpiresAt).getTime() > now.getTime()) continue;
      if (record.attempts >= maximumAttempts) {
        this.#outbox.set(id, { ...record, state: "failed", leaseOwner: null, leaseExpiresAt: null });
        if (record.effect !== "notification") await this.enqueueEffect(record.runId, "notification", `stuck-outbox:${record.id}`, now);
        failedOutboxIds.push(id);
      } else {
        this.#outbox.set(id, { ...record, state: "pending", leaseOwner: null, leaseExpiresAt: null });
        releasedOutboxIds.push(id);
      }
    }
    return { releasedRunIds, terminalizedRunIds, releasedOutboxIds, failedOutboxIds };
  }

  async snapshot(): Promise<FinalizedPublication> {
    return copy({
      lastValidDeploymentId: this.#lastValidDeploymentId,
      deployments: [...this.#deployments.values()],
      manifests: [...this.#manifests.values()],
      qualityBaseline: this.#qualityBaseline,
      outbox: [...this.#outbox.values()],
      audits: [...this.#audits.values()],
    });
  }

  #audit(runId: string, event: string, outcome: AuditRecord["outcome"], at: Date, details: AuditRecord["details"]) {
    const id = `audit:${runId}:${event}:${this.#audits.size + 1}`;
    this.#audits.set(id, { id, runId, event, outcome, at: at.toISOString(), details: copy(details) });
  }
}
