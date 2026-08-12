import { canonicalJson, sha256 } from "../github/canonical";
import { independentPublicLeakScan, publicProjectionSchema } from "../composition/projection";
import { NORMATIVE_CONFIG_HASH, loadNormativeConfiguration } from "../publication-checks/config";
import type {
  ImmutablePreviewTarget,
  NormativeConfiguration,
  PreviewObservations,
  PublicationChecker,
  Sha256,
} from "../publication-checks/contracts";
import { createImmutablePreviewTarget } from "../publication-checks/preview";
import { runPublicationChecks } from "../publication-checks/runner";
import { publicationCheckInventory } from "../publication-checks/checkers";
import {
  AmbiguousProviderResultError,
  type CandidatePackage,
  type CandidatePackageStore,
  type DeploymentProvider,
  type OperationalEffectProvider,
  type ProductionCheckReport,
  type ProviderPreview,
  type PublicationChecks,
  type PublicationClock,
  requiredProductionCheckerIds,
} from "./contracts";

type Credential = {
  token: string;
  packageId: string;
  candidateHash: Sha256;
  expiresAt: string;
  used: boolean;
};

function clone<T>(value: T): T { return structuredClone(value); }

export function candidatePackageBytesHash(candidate: Omit<CandidatePackage, "bytesHash">): Sha256 {
  return sha256(canonicalJson(candidate));
}

export function scanPublicProjection(value: unknown): string[] {
  const findings = independentPublicLeakScan(value);
  const serialized = canonicalJson(value);
  const privatePatterns: [string, RegExp][] = [["credential-keyword", /\b(?:password|secret|api[_-]?key|bearer|token)\b/i]];
  for (const [finding, pattern] of privatePatterns) if (pattern.test(serialized)) findings.push(finding);
  return findings;
}

export class InMemoryCandidatePackageStore implements CandidatePackageStore {
  readonly #packages = new Map<string, CandidatePackage>();
  readonly #byHash = new Map<Sha256, string>();
  readonly #credentials = new Map<string, Credential>();
  readonly retrievals: { token: string; packageId: string; candidateHash: Sha256 }[] = [];

  async put(candidate: CandidatePackage, idempotencyKey: string) {
    void idempotencyKey;
    publicProjectionSchema.parse(candidate.publicProjection);
    const { bytesHash, ...contents } = candidate;
    if (candidatePackageBytesHash(contents) !== bytesHash) throw new Error("candidate-package-bytes-hash-mismatch");
    if (sha256(canonicalJson(candidate.publicProjection)) !== candidate.publicOutputHash) throw new Error("candidate-public-output-hash-mismatch");
    if (candidate.publicProjection.manifestHash !== candidate.manifestHash) throw new Error("candidate-public-manifest-hash-mismatch");
    if (scanPublicProjection(candidate.publicProjection).length) throw new Error("candidate-public-projection-rejected");
    const existing = this.#byHash.get(candidate.candidateHash);
    if (existing) {
      const prior = this.#packages.get(existing)!;
      if (prior.bytesHash !== candidate.bytesHash) throw new Error("candidate-hash-package-conflict");
      return { packageId: existing };
    }
    const packageId = `package:${candidate.bytesHash.slice(7, 31)}`;
    this.#packages.set(packageId, clone(candidate));
    this.#byHash.set(candidate.candidateHash, packageId);
    return { packageId };
  }

  async find(candidateHash: Sha256) {
    const packageId = this.#byHash.get(candidateHash);
    return packageId ? { packageId, bytesHash: this.#packages.get(packageId)!.bytesHash } : null;
  }

  async issueBuildCredential(input: { packageId: string; candidateHash: Sha256; expiresAt: string }) {
    const candidate = this.#packages.get(input.packageId);
    if (!candidate || candidate.candidateHash !== input.candidateHash) throw new Error("candidate-package-scope-mismatch");
    const token = `candidate-token:${sha256(canonicalJson({ ...input, ordinal: this.#credentials.size })).slice(7, 39)}`;
    this.#credentials.set(token, { token, ...input, used: false });
    return { token };
  }

  async retrieve(token: string, packageId: string, now: string) {
    const credential = this.#credentials.get(token);
    if (!credential || credential.packageId !== packageId) throw new Error("candidate-credential-scope-denied");
    if (credential.used) throw new Error("candidate-credential-already-used");
    if (new Date(credential.expiresAt).getTime() <= new Date(now).getTime()) throw new Error("candidate-credential-expired");
    const candidate = this.#packages.get(packageId);
    if (!candidate || candidate.candidateHash !== credential.candidateHash) throw new Error("candidate-package-identity-mismatch");
    credential.used = true;
    this.retrievals.push({ token, packageId, candidateHash: candidate.candidateHash });
    return clone(candidate);
  }
}

export class InMemoryDeploymentProvider implements DeploymentProvider {
  readonly #previews = new Map<string, ProviderPreview>();
  readonly #promotions = new Map<string, { providerDeploymentId: string }>();
  readonly previewCreations: { idempotencyKey: string; commit: string; providerDeploymentId: string }[] = [];
  readonly promotions: { idempotencyKey: string; providerDeploymentId: string }[] = [];
  #ambiguousPreviewRemaining: number;
  #ambiguousPromotionRemaining: number;

  constructor(private readonly input: {
    packages: CandidatePackageStore;
    clock: PublicationClock;
    observations: PreviewObservations;
    ambiguousPreviewResponses?: number;
    ambiguousPromotionResponses?: number;
  }) {
    this.#ambiguousPreviewRemaining = input.ambiguousPreviewResponses ?? 0;
    this.#ambiguousPromotionRemaining = input.ambiguousPromotionResponses ?? 0;
  }

  async createPreview(input: { idempotencyKey: string; commit: string; packageId: string; credential: string; candidateHash: Sha256 }) {
    const prior = this.#previews.get(input.idempotencyKey);
    if (prior) return clone(prior);
    const candidate = await this.input.packages.retrieve(input.credential, input.packageId, this.input.clock.now().toISOString());
    if (candidate.candidateHash !== input.candidateHash) throw new Error("build-candidate-identity-mismatch");
    if (sha256(canonicalJson(candidate.publicProjection)) !== candidate.publicOutputHash || scanPublicProjection(candidate.publicProjection).length) {
      throw new Error("build-public-projection-mismatch");
    }
    const providerDeploymentId = `provider:${sha256(input.idempotencyKey).slice(7, 31)}`;
    const target = createImmutablePreviewTarget({
      candidate: { id: candidate.id, hashes: { candidateHash: candidate.candidateHash, publicOutputHash: candidate.publicOutputHash }, publicManifestHash: candidate.manifestHash },
      deploymentId: providerDeploymentId,
      origin: `https://${providerDeploymentId.replace(":", "-")}.invalid`,
      capturedAt: this.input.clock.now().toISOString(),
      artifacts: [{ path: "/", contentType: "text/html", contentHash: candidate.publicOutputHash }],
      observations: this.input.observations,
    });
    const preview: ProviderPreview = { ...target.preview, providerDeploymentId };
    this.#previews.set(input.idempotencyKey, clone(preview));
    this.previewCreations.push({ idempotencyKey: input.idempotencyKey, commit: input.commit, providerDeploymentId });
    if (this.#ambiguousPreviewRemaining > 0) {
      this.#ambiguousPreviewRemaining -= 1;
      throw new AmbiguousProviderResultError("preview-created-response-lost");
    }
    return clone(preview);
  }

  async findPreview(idempotencyKey: string) { return clone(this.#previews.get(idempotencyKey) ?? null); }

  async promote(input: { idempotencyKey: string; providerDeploymentId: string }) {
    const prior = this.#promotions.get(input.idempotencyKey);
    if (prior) return clone(prior);
    if (![...this.#previews.values()].some(({ providerDeploymentId }) => providerDeploymentId === input.providerDeploymentId)) {
      throw new Error("unknown-preview-deployment");
    }
    const promoted = { providerDeploymentId: input.providerDeploymentId };
    this.#promotions.set(input.idempotencyKey, promoted);
    this.promotions.push({ ...input });
    if (this.#ambiguousPromotionRemaining > 0) {
      this.#ambiguousPromotionRemaining -= 1;
      throw new AmbiguousProviderResultError("promotion-applied-response-lost");
    }
    return clone(promoted);
  }

  async promotionState(idempotencyKey: string) { return clone(this.#promotions.get(idempotencyKey) ?? null); }
}

export class ExecutablePublicationChecks implements PublicationChecks {
  readonly #configuration: NormativeConfiguration;

  constructor(private readonly input: {
    configuration: NormativeConfiguration;
    checkers: PublicationChecker[];
    clock: PublicationClock;
    productionProbe: (target: Parameters<PublicationChecks["production"]>[0]) => Promise<ProductionCheckReport>;
  }) {
    this.#configuration = loadNormativeConfiguration(input.configuration);
  }

  preview(target: ImmutablePreviewTarget) {
    return runPublicationChecks(target, this.#configuration, this.input.checkers, { now: () => this.input.clock.now().toISOString() });
  }

  async production(target: Parameters<PublicationChecks["production"]>[0]): Promise<ProductionCheckReport> {
    return await this.input.productionProbe(target);
  }
}

export function createDeterministicProductionProbe(clock: PublicationClock) {
  return async (target: Parameters<PublicationChecks["production"]>[0]): Promise<ProductionCheckReport> => {
    const checkedAt = clock.now().toISOString();
    const reportPointer = `memory://production/${clock.now().getTime()}`;
    const targetIdentity = target.observationIdentity;
    return {
      outcome: "passed",
      pass: {
        candidateHash: target.candidateHash,
        manifestHash: target.manifestHash,
        publicOutputHash: target.publicOutputHash,
        deploymentId: target.providerDeploymentId,
        checkedAt,
        checks: requiredProductionCheckerIds.map((checkerId) => {
          const definition = publicationCheckInventory.find(({ id }) => id === checkerId)!;
          return {
          checkerId: definition.id,
          checkIdentity: sha256(canonicalJson({ targetIdentity, checkedAt })),
          checkerVersion: definition.version,
          ruleset: definition.ruleset,
          configurationHash: NORMATIVE_CONFIG_HASH,
          target: target.providerDeploymentId,
          targetIdentity,
          startedAt: checkedAt,
          finishedAt: checkedAt,
          outcome: "passed",
          classification: definition.classification,
          integrity: "valid",
          measurements: { identity: true, availability: true, runtime: true, navigation: true, accessibilitySmoke: true },
          attempts: [{ attempt: 1, cleanEnvironmentId: sha256(`${targetIdentity}:1`), integrity: "valid", reportPointer }],
          reportPointer,
          retentionClass: "compact-one-year",
        }; }),
      },
    };
  };
}

export class InMemoryOperationalEffectProvider implements OperationalEffectProvider {
  readonly #applied = new Map<string, { providerReference: string }>();
  readonly applications: { effect: "raw-deletion" | "cleanup" | "notification"; idempotencyKey: string }[] = [];
  #ambiguousRemaining: number;
  constructor(input: { ambiguousResponses?: number } = {}) { this.#ambiguousRemaining = input.ambiguousResponses ?? 0; }
  async read(_effect: "raw-deletion" | "cleanup" | "notification", idempotencyKey: string) { return clone(this.#applied.get(idempotencyKey) ?? null); }
  async apply(effect: "raw-deletion" | "cleanup" | "notification", idempotencyKey: string) {
    const result = { providerReference: `effect:${sha256(idempotencyKey).slice(7, 31)}` };
    this.#applied.set(idempotencyKey, result);
    this.applications.push({ effect, idempotencyKey });
    if (this.#ambiguousRemaining > 0) {
      this.#ambiguousRemaining -= 1;
      throw new AmbiguousProviderResultError("operational-effect-response-lost");
    }
    return clone(result);
  }
}
