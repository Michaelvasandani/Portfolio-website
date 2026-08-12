import type { PublicProjection } from "../composition/projection";
import type { CheckEvidence, ImmutablePreviewTarget, PublicationCheckRun, Sha256 } from "../publication-checks/contracts";

export type PublicationTrigger = "schedule" | "resume-upload" | "manual";

export type PublicationInput = Readonly<{
  trigger: PublicationTrigger;
  careerSnapshotId: string;
  githubSnapshotId: string;
  presentationPolicyId: string;
  presentationPolicyVersion: string;
  codeCommit: string;
  schemaHash: Sha256;
  parserVersion: string;
  generatorVersion: string;
  promptVersion: string;
  approvedRendererCommit: string;
  checkerVersions: Readonly<Record<string, string>>;
  checkerConfigurationHashes: Readonly<Record<string, Sha256>>;
  priorSelectionStateId: string | null;
  candidate: CandidatePackage;
}>;

export type PublicationArtifactIdentity = Readonly<{
  candidateHash: Sha256;
  publicOutputHash: Sha256;
  manifestHash: Sha256;
}>;

export type CandidateManifestBindings = Readonly<{
  renderedFields: readonly string[];
  generatedClauses: readonly Readonly<{ text: string; evidenceReferences: readonly string[] }>[];
  transformations: readonly Readonly<{ field: string; original: string; rendered: string }>[];
  evidenceReferences: readonly string[];
  validationOutcomes: readonly Readonly<{ name: string; outcome: "passed" }>[];
  recoveryDeploymentId: string | null;
}>;

export type CandidatePackage = PublicationArtifactIdentity & Readonly<{
  id: string;
  bytesHash: Sha256;
  publicProjection: PublicProjection;
  manifestBindings: CandidateManifestBindings;
}>;

export type PublicationRunPhase =
  | "queued"
  | "packaging"
  | "deploying-preview"
  | "validating-preview"
  | "promoting"
  | "verifying-production"
  | "finalizing";

export type PublicationCheckpoint =
  | Readonly<{ phase: "queued" | "packaging" }>
  | Readonly<{ phase: "deploying-preview"; packageId: string }>
  | Readonly<{ phase: "validating-preview"; packageId: string; deploymentId: string; providerDeploymentId: string }>
  | Readonly<{ phase: "promoting"; packageId: string; deploymentId: string; providerDeploymentId: string; previewValidation: PublicationCheckRun }>
  | Readonly<{ phase: "verifying-production" | "finalizing"; packageId: string; deploymentId: string; providerDeploymentId: string; nextProductionCheckAt: string | null; previewValidation: PublicationCheckRun }>;

export type TerminalState =
  | { kind: "succeeded" }
  | { kind: "failed"; reason: string }
  | { kind: "superseded"; reason: "newer-scheduled-input" };

export type ProductionPass = PublicationArtifactIdentity & Readonly<{
  checkedAt: string;
  deploymentId: string;
  checks: readonly CheckEvidence[];
}>;

export type PublicationRun = Readonly<{
  id: string;
  sequence: number;
  input: PublicationInput;
  phase: PublicationRunPhase;
  version: number;
  checkpoint: PublicationCheckpoint;
  lease: Readonly<{ owner: string; expiresAt: string }> | null;
  attempts: Readonly<Record<string, number>>;
  productionPasses: readonly ProductionPass[];
  diagnostics: readonly PublicationCheckRun[];
  productionDiagnostics: readonly ProductionCheckReport[];
  terminal: TerminalState | null;
  createdAt: string;
  updatedAt: string;
}>;

export type DeploymentRecord = PublicationArtifactIdentity & Readonly<{
  id: string;
  providerDeploymentId: string;
  runId: string;
  publicationManifestId: string;
  origin: string;
  state: "preview" | "promoted" | "valid" | "rejected";
  precedingValidDeploymentId: string | null;
}>;

export type FinalizedManifest = Readonly<{
  id: string;
  runId: string;
  input: PublicationInput;
  deploymentId: string;
  providerDeploymentId: string;
  packageId: string;
  bindings: CandidateManifestBindings;
  previewValidation: PublicationCheckRun;
  productionPasses: readonly ProductionPass[];
  finalizedAt: string;
}>;

export type QualityBaseline = Readonly<{
  deploymentId: string;
  candidateHash: Sha256;
  publicOutputHash: Sha256;
  establishedAt: string;
}>;

export type OutboxEffect = "candidate-package" | "deployment" | "promotion" | "raw-deletion" | "cleanup" | "notification";
export type OutboxRecord = Readonly<{
  id: string;
  runId: string;
  effect: OutboxEffect;
  idempotencyKey: string;
  state: "pending" | "leased" | "applied" | "failed";
  attempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  providerReference: string | null;
}>;

export type AuditRecord = Readonly<{
  id: string;
  runId: string;
  event: string;
  outcome: "accepted" | "rejected" | "warning";
  at: string;
  details: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type FinalizedPublication = Readonly<{
  lastValidDeploymentId: string | null;
  deployments: readonly DeploymentRecord[];
  manifests: readonly FinalizedManifest[];
  qualityBaseline: QualityBaseline | null;
  outbox: readonly OutboxRecord[];
  audits: readonly AuditRecord[];
}>;

export interface CandidatePackageStore {
  put(candidate: CandidatePackage, idempotencyKey: string): Promise<{ packageId: string }>;
  find(candidateHash: Sha256): Promise<{ packageId: string; bytesHash: Sha256 } | null>;
  issueBuildCredential(input: { packageId: string; candidateHash: Sha256; expiresAt: string }): Promise<{ token: string }>;
  retrieve(token: string, packageId: string, now: string): Promise<CandidatePackage>;
}

export type ProviderPreview = ImmutablePreviewTarget["preview"] & Readonly<{ providerDeploymentId: string }>;

export interface DeploymentProvider {
  createPreview(input: {
    idempotencyKey: string;
    commit: string;
    packageId: string;
    credential: string;
    candidateHash: Sha256;
  }): Promise<ProviderPreview>;
  findPreview(idempotencyKey: string): Promise<ProviderPreview | null>;
  promote(input: { idempotencyKey: string; providerDeploymentId: string }): Promise<{ providerDeploymentId: string }>;
  promotionState(idempotencyKey: string): Promise<{ providerDeploymentId: string } | null>;
}

export type ProductionCheckReport =
  | { outcome: "passed"; pass: ProductionPass }
  | { outcome: "blocked"; reason: string; reportPointer: string; checks: readonly [CheckEvidence, ...CheckEvidence[]] };

export const requiredProductionCheckerIds = ["candidate-identity", "assets", "links", "accessibility", "checker-integrity"] as const;

export interface PublicationChecks {
  preview(target: ImmutablePreviewTarget): Promise<PublicationCheckRun>;
  production(target: {
    providerDeploymentId: string;
    observationIdentity: Sha256;
    requestedAt: string;
  } & PublicationArtifactIdentity): Promise<ProductionCheckReport>;
}

export interface OperationalEffectProvider {
  read(effect: "raw-deletion" | "cleanup" | "notification", idempotencyKey: string): Promise<{ providerReference: string } | null>;
  apply(effect: "raw-deletion" | "cleanup" | "notification", idempotencyKey: string): Promise<{ providerReference: string }>;
}

export type PublicationClock = { now(): Date };

export class AmbiguousProviderResultError extends Error {
  constructor(message = "provider-result-ambiguous") {
    super(message);
    this.name = "AmbiguousProviderResultError";
  }
}

export class ProductionAdapterUnavailableError extends Error {
  constructor(adapter: string) {
    super(`${adapter}-production-adapter-unavailable`);
    this.name = "ProductionAdapterUnavailableError";
  }
}
