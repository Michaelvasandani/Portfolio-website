export type Sha256 = `sha256:${string}`;
export type CheckOutcome = "passed" | "warning" | "blocked";
export type CheckClassification = "blocking" | "warning";
export type CheckIntegrity = "valid" | "crashed" | "timed-out" | "missing" | "stale" | "contradictory";

export type NormativeConfiguration = {
  schemaVersion: 1;
  environment: Record<string, unknown>;
  viewports: { width: number; height: number }[];
  accessibility: Record<string, unknown>;
  thresholds: {
    performance: {
      runs: number; minimumMedianScore: number; minimumRunScore: number; medianFcpMs: number; medianSpeedIndexMs: number;
      medianLcpMs: number; medianTbtMs: number; medianCls: number; poorFcpMs: number; poorSpeedIndexMs: number;
      poorLcpMs: number; poorTbtMs: number; poorCls: number; compressedInitialJavaScriptBytes: number;
      totalInitialTransferBytes: number; regressionPercent: number; timingMaterialToleranceMs: number; transferMaterialToleranceBytes: number;
    };
    generatedCopy: { cardProofWords: number[]; aboutMaximumWords: number; projectDescriptionWords: number[]; projectDescriptionSentences: number };
    githubFreshnessHours: number;
    externalLinks: Record<string, unknown>;
  };
  retry: { maximumRetries: 2; cleanEnvironmentEachAttempt: true; attemptTimeoutMs: number };
  checkers: { id: CheckerId; version: string; ruleset: string; classification: CheckClassification }[];
  retention: { compactDays: number; bulkyRejectedDays: number; restorableValidDeployments: number };
  lighthouse: Record<string, unknown>;
};

export type CheckerId =
  | "candidate-identity" | "manifest-hash" | "provenance" | "completeness" | "public-projection"
  | "privacy-leak" | "generated-copy" | "accessibility" | "responsive" | "performance" | "seo"
  | "structured-data" | "links" | "assets" | "public-resume" | "pdf-ua" | "checker-integrity"
  | "subjective-visual" | "content-screenshot" | "field-performance";

export type CheckerDefinition = {
  id: CheckerId;
  requirement: string;
  version: string;
  ruleset: string;
  classification: CheckClassification;
  contradicts: CheckerId[];
};

export type PreviewObservations = { [K in CheckerId]: { measurements: CheckerMeasurements[K]; reason?: string; reportPointer?: string } };

export type ImmutablePreviewTarget = Readonly<{
  candidate: Readonly<{ id: string; hashes: Readonly<{ candidateHash: Sha256; publicOutputHash: Sha256 }>; publicManifestHash: Sha256 }>;
  preview: Readonly<{
    deploymentId: string;
    origin: string;
    zeroTraffic: true;
    productionShaped: true;
    candidateHash: Sha256;
    manifestHash: Sha256;
    publicOutputHash: Sha256;
    capturedAt: string;
    artifacts: readonly Readonly<{ path: string; contentType: string; contentHash: Sha256 }>[];
    observations: PreviewObservations;
  }>;
}>;

export type CheckerAttemptContext = { attempt: number; cleanEnvironmentId: string; configurationHash: Sha256; configuration: NormativeConfiguration };
export type CheckerExecution = {
  integrity: CheckIntegrity;
  outcome?: CheckOutcome;
  measurements: Record<string, string | number | boolean>;
  reportPointer: string | null;
  targetIdentity: Sha256;
};
export type PublicationChecker = {
  definition: CheckerDefinition;
  createAttempt(): { run(target: ImmutablePreviewTarget, context: CheckerAttemptContext): Promise<CheckerExecution> };
};

export type CheckEvidence = {
  checkerId: CheckerId;
  checkIdentity: Sha256;
  checkerVersion: string;
  ruleset: string;
  configurationHash: Sha256;
  target: string;
  targetIdentity: Sha256;
  startedAt: string;
  finishedAt: string;
  outcome: CheckOutcome;
  classification: CheckClassification;
  integrity: CheckIntegrity;
  measurements: Record<string, string | number | boolean>;
  attempts: { attempt: number; cleanEnvironmentId: string; integrity: CheckIntegrity; reportPointer: string | null }[];
  reportPointer: string | null;
  retentionClass: "compact-one-year";
};

export type PublicationCheckRun = {
  outcome: CheckOutcome;
  checks: CheckEvidence[];
  evidence: {
    schemaVersion: 1;
    configurationHash: Sha256;
    candidateHash: Sha256;
    manifestHash: Sha256;
    publicOutputHash: Sha256;
    deploymentId: string;
    retentionClass: "compact-one-year";
  };
};
import type { CheckerMeasurements } from "./measurements";
