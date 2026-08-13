import { z } from "zod";

import { httpsUrlSchema, immutableIdSchema, isoDateTimeSchema, sha256Schema } from "./primitives";

const SCHEMA_VERSION = 1 as const;

const immutableRecord = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: immutableIdSchema,
  contentHash: sha256Schema,
  createdAt: isoDateTimeSchema,
};

const sourceValueSchema = z
  .object({
    original: z.string(),
    normalized: z.string().optional(),
    transformation: z
      .enum(["whitespace", "typography", "url", "date"])
      .optional(),
    sourceOrder: z.number().int().nonnegative(),
    sourceLocation: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.normalized === undefined) !== (value.transformation === undefined)) {
      context.addIssue({
        code: "custom",
        message: "normalized values and transformations must be recorded together",
      });
    }
  });

const orderedTextSchema = z
  .object({
    text: sourceValueSchema,
    sourceOrder: z.number().int().nonnegative(),
  })
  .strict();

const dateRangeSchema = z
  .object({
    start: sourceValueSchema,
    end: sourceValueSchema.optional(),
    current: z.boolean(),
  })
  .strict();

const contactSchema = z
  .object({
    kind: z.enum(["email", "github", "linkedin"]),
    value: sourceValueSchema,
  })
  .strict();

const experienceSchema = z
  .object({
    id: immutableIdSchema,
    organization: sourceValueSchema,
    title: sourceValueSchema,
    location: sourceValueSchema.optional(),
    dates: dateRangeSchema,
    sourceOrder: z.number().int().nonnegative(),
    bullets: z.array(orderedTextSchema),
  })
  .strict();

const educationSchema = z
  .object({
    id: immutableIdSchema,
    institution: sourceValueSchema,
    degree: sourceValueSchema,
    location: sourceValueSchema.optional(),
    dates: dateRangeSchema,
    gpa: sourceValueSchema.optional(),
    coursework: z.array(orderedTextSchema).optional(),
    details: z.array(orderedTextSchema),
    sourceOrder: z.number().int().nonnegative(),
  })
  .strict();

const careerProjectSchema = z
  .object({
    id: immutableIdSchema,
    name: sourceValueSchema,
    technologies: z.array(sourceValueSchema),
    sourceLinks: z.array(sourceValueSchema),
    sourceOrder: z.number().int().nonnegative(),
    bullets: z.array(orderedTextSchema),
  })
  .strict();

const skillGroupSchema = z
  .object({
    name: sourceValueSchema,
    items: z.array(sourceValueSchema),
    sourceOrder: z.number().int().nonnegative(),
  })
  .strict();

const optionalSectionSchema = z
  .object({
    kind: z.enum(["awards", "certifications", "publications", "volunteering"]),
    heading: sourceValueSchema,
    items: z.array(orderedTextSchema),
    sourceOrder: z.number().int().nonnegative(),
  })
  .strict();

export const careerSnapshotSchema = z
  .object({
    ...immutableRecord,
    sourceDocumentHash: sha256Schema,
    person: z
      .object({
        name: sourceValueSchema,
        location: sourceValueSchema.optional(),
        contacts: z.array(contactSchema),
      })
      .strict(),
    experience: z.array(experienceSchema),
    education: z.array(educationSchema),
    projects: z.array(careerProjectSchema),
    skills: z.array(skillGroupSchema),
    optionalSections: z.array(optionalSectionSchema),
  })
  .strict();

const evidenceDocumentSchema = z
  .object({
    id: immutableIdSchema,
    kind: z.enum(["readme", "documentation", "manifest", "source", "test", "build", "release"]),
    sourceUrl: httpsUrlSchema,
    contentHash: sha256Schema,
  })
  .strict();

const repositorySchema = z
  .object({
    id: immutableIdSchema,
    name: z.string().min(1),
    url: httpsUrlSchema,
    visibility: z.literal("public"),
    pinPosition: z.number().int().positive().nullable(),
    topics: z.array(z.string()),
    languages: z.array(z.string()),
    releases: z.array(z.string()),
    meaningfulActivityAt: isoDateTimeSchema.nullable(),
    evidence: z.array(evidenceDocumentSchema),
    fetchOutcomes: z.array(
      z
        .object({
          endpoint: z.string().min(1),
          status: z.enum(["success", "not-modified", "failed"]),
          fetchedAt: isoDateTimeSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const githubSnapshotSchema = z
  .object({
    ...immutableRecord,
    collectedAt: isoDateTimeSchema,
    owner: z
      .object({
        login: z.string().min(1),
        numericId: z.string().regex(/^\d+$/),
      })
      .strict(),
    repositories: z.array(repositorySchema),
  })
  .strict();

export const presentationPolicySchema = z
  .object({
    ...immutableRecord,
    policyVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    primaryThesis: z.string().min(1),
    fallbackThesis: z.string().min(1),
    publicContactKinds: z.array(z.enum(["email", "github", "linkedin"])),
    projectTarget: z.literal(5),
  })
  .strict();

const scoreSchema = z
  .object({
    pin: z.number().min(0).max(35),
    resumeMatch: z.number().min(0).max(30),
    evidence: z.number().min(0).max(20),
    relevance: z.number().min(0).max(10),
    recency: z.number().min(0).max(5),
    total: z.number().min(0).max(100),
  })
  .strict()
  .refine(
    (score) => score.total === score.pin + score.resumeMatch + score.evidence + score.relevance + score.recency,
    "score total must equal its components",
  );

export const projectSelectionStateSchema = z
  .object({
    ...immutableRecord,
    githubSnapshotId: immutableIdSchema,
    careerSnapshotId: immutableIdSchema,
    selected: z.array(
      z
        .object({
          repositoryId: immutableIdSchema,
          order: z.number().int().nonnegative(),
          score: scoreSchema,
          resumeProjectId: immutableIdSchema.nullable(),
          consecutiveLeadDays: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

export const evidenceReferenceSchema = z
  .object({
    source: z.enum(["career", "github", "presentation"]),
    snapshotId: immutableIdSchema,
    fieldPath: z.string().min(1),
    valueHash: sha256Schema,
  })
  .strict();

function referencesPinnedInputs(
  value: { careerSnapshotId: string; githubSnapshotId: string; presentationPolicyId?: string; evidenceReferences?: z.infer<typeof evidenceReferenceSchema>[]; references?: z.infer<typeof evidenceReferenceSchema>[] },
  context: z.RefinementCtx,
) {
  const pinned = {
    career: value.careerSnapshotId,
    github: value.githubSnapshotId,
    presentation: value.presentationPolicyId,
  };
  for (const reference of value.evidenceReferences ?? value.references ?? []) {
    if (pinned[reference.source] !== reference.snapshotId) {
      context.addIssue({
        code: "custom",
        path: ["evidenceReferences"],
        message: `evidence reference must resolve to the pinned ${reference.source} input`,
      });
    }
  }
}

export const evidencePacketSchema = z
  .object({
    ...immutableRecord,
    careerSnapshotId: immutableIdSchema,
    githubSnapshotId: immutableIdSchema,
    presentationPolicyId: immutableIdSchema,
    references: z.array(evidenceReferenceSchema),
  })
  .strict()
  .superRefine(referencesPinnedInputs);

export const generatedOutputSchema = z
  .object({
    ...immutableRecord,
    evidencePacketId: immutableIdSchema,
    careerSnapshotId: immutableIdSchema,
    githubSnapshotId: immutableIdSchema,
    presentationPolicyId: immutableIdSchema,
    provider: z.string().min(1),
    model: z.string().min(1),
    generatorVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    clauses: z.array(
      z
        .object({
          id: immutableIdSchema,
          text: z.string().min(1),
          placement: z.enum(["card", "about", "project"]),
          evidenceReferences: z.array(evidenceReferenceSchema).min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    referencesPinnedInputs(
      {
        careerSnapshotId: value.careerSnapshotId,
        githubSnapshotId: value.githubSnapshotId,
        presentationPolicyId: value.presentationPolicyId,
        evidenceReferences: value.clauses.flatMap(({ evidenceReferences }) => evidenceReferences),
      },
      context,
    );
  });

const checkOutcomeSchema = z.enum(["passed", "failed", "warning"]);

export const checkResultSchema = z
  .object({
    ...immutableRecord,
    checker: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        configurationHash: sha256Schema,
        environment: z.string().min(1),
      })
      .strict(),
    target: z.string().min(1),
    startedAt: isoDateTimeSchema,
    finishedAt: isoDateTimeSchema,
    outcome: checkOutcomeSchema,
    measurements: z.record(z.string(), z.number()),
    retryHistory: z.array(isoDateTimeSchema).max(2),
    artifactPointer: z.string().min(1),
  })
  .strict();

export const publicationManifestSchema = z
  .object({
    ...immutableRecord,
    careerSnapshotId: immutableIdSchema,
    githubSnapshotId: immutableIdSchema,
    presentationPolicyId: immutableIdSchema,
    selectionStateId: immutableIdSchema,
    evidencePacketId: immutableIdSchema,
    generatedOutputId: immutableIdSchema,
    codeCommit: z.string().regex(/^[a-f0-9]{40}$/),
    schemaHash: sha256Schema,
    parserVersion: z.string().min(1),
    generatorVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    approvedRendererCommit: z.string().regex(/^[a-f0-9]{40}$/),
    checkerConfigurationHashes: z.array(sha256Schema),
    candidateHash: sha256Schema,
    publicOutputHash: sha256Schema,
    evidenceReferences: z.array(evidenceReferenceSchema),
    transformations: z.array(sourceValueSchema),
    renderedFields: z.array(z.string().min(1)),
    checkResultIds: z.array(immutableIdSchema),
    deploymentId: immutableIdSchema.nullable(),
    recoveryDeploymentId: immutableIdSchema.nullable(),
  })
  .strict()
  .superRefine(referencesPinnedInputs);

export const publicationRunStates = [
  "queued",
  "ingesting",
  "normalizing",
  "reconciling",
  "selecting",
  "generating",
  "rendering",
  "validating",
  "deploying-preview",
  "validating-preview",
  "promoting",
  "verifying-production",
  "finalizing",
  "succeeded",
  "failed",
] as const;

export const publicationRunSchema = z
  .object({
    ...immutableRecord,
    state: z.enum(publicationRunStates),
    careerSnapshotId: immutableIdSchema,
    githubSnapshotId: immutableIdSchema,
    presentationPolicyId: immutableIdSchema,
    presentationPolicyVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    codeCommit: z.string().regex(/^[a-f0-9]{40}$/),
    schemaHash: sha256Schema,
    parserVersion: z.string().min(1),
    generatorVersion: z.string().min(1),
    promptVersion: z.string().min(1),
    approvedRendererCommit: z.string().regex(/^[a-f0-9]{40}$/),
    checkerVersions: z.record(z.string().min(1), z.string().min(1)),
    checkerConfigurationHashes: z.record(z.string().min(1), sha256Schema),
    priorSelectionStateId: immutableIdSchema.nullable(),
    candidateHash: sha256Schema.nullable(),
    idempotencyKey: z.string().min(1),
    leaseOwner: z.string().min(1).nullable(),
    leaseExpiresAt: isoDateTimeSchema.nullable(),
    checkpoint: z.string().nullable(),
  })
  .strict();

export const deploymentStates = ["preview", "validating", "promoted", "valid", "quarantined", "restore-failed"] as const;

export const deploymentSchema = z
  .object({
    ...immutableRecord,
    state: z.enum(deploymentStates),
    publicationManifestId: immutableIdSchema,
    candidateHash: sha256Schema,
    publicOutputHash: sha256Schema,
    providerDeploymentId: z.string().min(1),
    precedingValidDeploymentId: immutableIdSchema.nullable(),
  })
  .strict();

export const outboxRecordSchema = z
  .object({
    ...immutableRecord,
    effect: z.enum(["raw-deletion", "deployment", "promotion", "rollback", "cleanup", "notification"]),
    state: z.enum(["pending", "leased", "applied", "failed"]),
    idempotencyKey: z.string().min(1),
    aggregateId: immutableIdSchema,
    leaseExpiresAt: isoDateTimeSchema.nullable(),
    providerReference: z.string().nullable(),
    attempts: z.number().int().nonnegative(),
  })
  .strict();

export const notificationRecordSchema = z
  .object({
    ...immutableRecord,
    kind: z.enum(["automatic-rollback", "rollback-failure", "terminal-publication-failure", "stuck-reconciliation", "missed-github-collection", "security-rejection"]),
    aggregateId: immutableIdSchema,
    idempotencyKey: z.string().min(1),
    subject: z.string().min(1),
    details: z.string().min(1),
    manualSteps: z.array(z.string().min(1)),
    state: z.enum(["pending", "delivered", "failed"]),
    providerMessageId: z.string().min(1).nullable(),
    attempts: z.number().int().nonnegative(),
  })
  .strict();

export const breakerStateSchema = z
  .object({
    ...immutableRecord,
    state: z.enum(["closed", "open"]),
    servedDeploymentId: immutableIdSchema,
    openedByDeploymentId: immutableIdSchema.nullable(),
    reason: z.string().nullable(),
  })
  .strict();

export const auditRecordSchema = z
  .object({
    ...immutableRecord,
    event: z.string().min(1),
    actor: z.enum(["system", "owner"]),
    aggregateId: immutableIdSchema,
    outcome: z.enum(["accepted", "rejected", "warning"]),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

export const contractSchemas = {
  careerSnapshot: careerSnapshotSchema,
  githubSnapshot: githubSnapshotSchema,
  presentationPolicy: presentationPolicySchema,
  projectSelectionState: projectSelectionStateSchema,
  evidencePacket: evidencePacketSchema,
  generatedOutput: generatedOutputSchema,
  publicationManifest: publicationManifestSchema,
  publicationRun: publicationRunSchema,
  deployment: deploymentSchema,
  checkResult: checkResultSchema,
  outboxRecord: outboxRecordSchema,
  notificationRecord: notificationRecordSchema,
  breakerState: breakerStateSchema,
  auditRecord: auditRecordSchema,
} as const;

export type ContractName = keyof typeof contractSchemas;

export const contractParsers: Record<ContractName, (input: unknown) => unknown> = Object.fromEntries(
  Object.entries(contractSchemas).map(([name, schema]) => [name, (input: unknown) => schema.parse(input)]),
) as Record<ContractName, (input: unknown) => unknown>;

export const parseCareerSnapshot = careerSnapshotSchema.parse;
export const parseGithubSnapshot = githubSnapshotSchema.parse;
export const parsePresentationPolicy = presentationPolicySchema.parse;
export const parseProjectSelectionState = projectSelectionStateSchema.parse;
export const parseEvidencePacket = evidencePacketSchema.parse;
export const parseGeneratedOutput = generatedOutputSchema.parse;
export const parsePublicationManifest = publicationManifestSchema.parse;
export const parsePublicationRun = publicationRunSchema.parse;
export const parseDeployment = deploymentSchema.parse;
export const parseCheckResult = checkResultSchema.parse;
export const parseOutboxRecord = outboxRecordSchema.parse;
export const parseNotificationRecord = notificationRecordSchema.parse;
export const parseBreakerState = breakerStateSchema.parse;
export const parseAuditRecord = auditRecordSchema.parse;
