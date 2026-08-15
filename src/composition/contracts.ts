import { z } from "zod";

import type { CareerSnapshot } from "../ingestion/service";
import type { GitHubSnapshot } from "../github/snapshot-contract";

export type Score = {
  pin: number;
  resumeMatch: number;
  evidence: number;
  relevance: number;
  recency: number;
  total: number;
};

export type EvidencePointer = {
  id: string;
  source: "career" | "github" | "presentation";
  snapshotId: string;
  fieldPath: string;
  value: string;
  valueHash: `sha256:${string}`;
};

export type RepositoryProfile = {
  repositoryId: string;
  attributable: boolean;
  original: boolean;
  substantive: boolean;
  coherentPurpose: boolean;
  relevance: 0 | 4 | 6 | 8 | 10;
  evidenceSignals: {
    purpose: boolean;
    implementation: boolean;
    engineeringProof: boolean;
    traceableSpecifics: boolean;
  };
  diversity: readonly [string, string, string];
  narrativeEvidencePaths: readonly string[];
  verifiedDemonstration?: {
    fieldPath: string;
    url: string;
    checkedAt: string;
    status: "reachable";
    repositoryIdentityConfirmed: true;
  };
  aliasMatches: {
    careerProjectId: string;
    alias: string;
    corroboratingFacts: {
      careerPath: string;
      githubPath: string;
    }[];
  }[];
};

export type MatchDecision = {
  kind: "none" | "direct-url" | "alias-corroborated" | "ambiguous";
  resumeProjectId: string | null;
  candidateProjectIds: string[];
  evidencePaths: string[];
};

export type ProjectEvaluation = {
  repositoryId: string;
  repositoryName: string;
  eligible: boolean;
  ineligibleReasons: string[];
  pinned: boolean;
  pinPosition: number | null;
  score: Score;
  match: MatchDecision;
  diversity: readonly [string, string, string];
  evidencePaths: string[];
};

export type StabilityComparison = {
  incumbentRepositoryId: string;
  challengerRepositoryId: string;
  lead: number;
  consecutiveRuns: number;
};

export type SelectionState = {
  id: string;
  contentHash: `sha256:${string}`;
  careerSnapshotId: string;
  githubSnapshotId: string;
  selected: {
    repositoryId: string;
    repositoryName: string;
    order: number;
    score: Score;
    match: MatchDecision;
    eligible: boolean;
    pinned: boolean;
  }[];
  evaluations: ProjectEvaluation[];
  comparisons: StabilityComparison[];
};

export type CompositionPolicy = {
  id: string;
  contentHash: `sha256:${string}`;
  policyVersion: string;
  primaryThesis: string;
  fallbackThesis: string;
  kicker: string;
  roleLine: string;
  publicContactKinds: readonly ("email" | "github" | "linkedin")[];
  projectTarget: number;
  metadata: { title: string; description: string };
  resume: { htmlPath: string; pdfPath: string };
};

export type SourceConflict = {
  field: string;
  careerValue: string;
  githubValue: string;
  historicalStatesExplicit: boolean;
};

export type CompositionVersions = {
  codeCommit: string;
  approvedRendererCommit: string;
  schemaVersion: string;
  parserVersion: string;
  generatorVersion: string;
  promptVersion: string;
  checkerConfigurationHashes: string[];
};

export type CompositionInput = {
  career: CareerSnapshot;
  github: GitHubSnapshot;
  policy: CompositionPolicy;
  profiles: RepositoryProfile[];
  priorState: SelectionState | null;
  sourceConflicts: SourceConflict[];
  runAt: string;
  lastValidCandidateId: string | null;
  versions: CompositionVersions;
  priorNarrative?: {
    requestEvidenceHashes: Record<string, `sha256:${string}`>;
    output: GeneratorOutput;
  };
};

export const generatorRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatorVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    evidence: z.array(
      z.object({ id: z.string().startsWith("evidence:"), text: z.string().min(1).max(2_000) }).strict(),
    ),
    requests: z.array(
      z
        .object({
          id: z.string().min(1),
          placement: z.enum(["card", "about", "experience", "project"]),
          minimumWords: z.number().int().positive(),
          maximumWords: z.number().int().positive(),
          evidenceIds: z.array(z.string().startsWith("evidence:")).min(1),
          subject: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const generatorOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    sentences: z.array(
      z
        .object({
          requestId: z.string().min(1),
          text: z.string().min(1),
          clauses: z.array(
            z
              .object({
                text: z.string().min(1),
                evidenceIds: z.array(z.string().startsWith("evidence:")).min(1),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export type GeneratorRequest = z.infer<typeof generatorRequestSchema>;
export type GeneratorOutput = z.infer<typeof generatorOutputSchema>;

export interface NarrativeGenerator {
  generate(request: GeneratorRequest): Promise<unknown>;
}
