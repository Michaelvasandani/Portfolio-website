import { z } from "zod";

import { canonicalJson, sha256 } from "./canonical";

const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const httpsUrlSchema = z.url().refine((value) => value.startsWith("https://"), "HTTPS URL required");

export const githubEvidenceEndpoints = [
  "readme",
  "topics",
  "languages",
  "releases",
  "activity",
  "source-structure",
] as const;

export type GitHubEvidenceEndpoint = (typeof githubEvidenceEndpoints)[number];

const fetchOutcomeSchema = z
  .object({
    endpoint: z.enum(githubEvidenceEndpoints),
    required: z.boolean(),
    status: z.enum(["success", "not-modified", "failed"]),
    fetchedAt: isoDateTimeSchema,
    httpStatus: z.number().int().min(100).max(599).nullable(),
    attempts: z.number().int().nonnegative().max(3),
    errorCode: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((outcome, context) => {
    if ((outcome.status === "failed") !== (outcome.errorCode !== undefined)) {
      context.addIssue({ code: "custom", message: "only failed fetches record an error code" });
    }
  });

const evidenceDocumentSchema = z
  .object({
    id: z.string().startsWith("evidence:"),
    kind: z.literal("readme"),
    path: z.string().min(1),
    sourceUrl: httpsUrlSchema,
    sourceContent: z.string(),
    sourceHash: hashSchema,
    renderedContent: z.string(),
    renderedHash: hashSchema,
  })
  .strict()
  .superRefine((document, context) => {
    if (sha256(document.sourceContent) !== document.sourceHash) {
      context.addIssue({ code: "custom", path: ["sourceHash"], message: "source hash mismatch" });
    }
    if (sha256(document.renderedContent) !== document.renderedHash) {
      context.addIssue({ code: "custom", path: ["renderedHash"], message: "rendered hash mismatch" });
    }
  });

export const normalizedRepositorySchema = z
  .object({
    id: z.string().startsWith("repository:"),
    nodeId: z.string().min(1),
    name: z.string().min(1),
    nameWithOwner: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    url: httpsUrlSchema,
    description: z.string().nullable(),
    homepageUrl: httpsUrlSchema.nullable(),
    visibility: z.literal("public"),
    pinPosition: z.number().int().positive().nullable(),
    archived: z.boolean(),
    disabled: z.boolean(),
    fork: z.boolean(),
    defaultBranch: z.string().min(1).nullable(),
    topics: z.array(z.string().min(1)),
    languages: z.array(z.object({ name: z.string().min(1), bytes: z.number().int().nonnegative() }).strict()),
    releases: z.array(
      z
        .object({
          tag: z.string().min(1),
          name: z.string().nullable(),
          publishedAt: isoDateTimeSchema.nullable(),
          sourceUrl: httpsUrlSchema,
        })
        .strict(),
    ),
    meaningfulActivityAt: isoDateTimeSchema.nullable(),
    documents: z.array(evidenceDocumentSchema),
    sourceStructure: z.array(
      z
        .object({
          path: z.string().min(1),
          type: z.string().min(1),
          objectHash: z.string().min(1),
          size: z.number().int().nonnegative().nullable(),
        })
        .strict(),
    ),
    fetchOutcomes: z.array(fetchOutcomeSchema).length(githubEvidenceEndpoints.length),
    sourceUrls: z.array(httpsUrlSchema),
  })
  .strict()
  .superRefine((repository, context) => {
    const endpoints = repository.fetchOutcomes.map(({ endpoint }) => endpoint);
    if (new Set(endpoints).size !== githubEvidenceEndpoints.length) {
      context.addIssue({ code: "custom", path: ["fetchOutcomes"], message: "one outcome per evidence endpoint required" });
    }
  });

export const githubSnapshotIdentitySchema = z
  .object({
    owner: z.object({ login: z.string().min(1), numericId: z.string().regex(/^\d+$/) }).strict(),
    pinOrder: z.array(z.string().startsWith("repository:")),
    repositories: z.array(normalizedRepositorySchema),
    collectionStatus: z.enum(["complete", "partial"]),
  })
  .strict();

export const githubSnapshotSchema = githubSnapshotIdentitySchema
  .extend({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^github:[a-f0-9]{64}$/),
    contentHash: hashSchema,
    evidenceHash: hashSchema,
    renderedContentHash: hashSchema,
    createdAt: isoDateTimeSchema,
    collectedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const repositoryIds = new Set(snapshot.repositories.map(({ id }) => id));
    if (snapshot.pinOrder.some((id) => !repositoryIds.has(id)) || new Set(snapshot.pinOrder).size !== snapshot.pinOrder.length) {
      context.addIssue({ code: "custom", path: ["pinOrder"], message: "pin order must reference unique snapshot repositories" });
    }
    const orderedPins = snapshot.repositories
      .filter((repository) => repository.pinPosition !== null)
      .sort((left, right) => (left.pinPosition ?? 0) - (right.pinPosition ?? 0))
      .map(({ id }) => id);
    if (canonicalJson(orderedPins) !== canonicalJson(snapshot.pinOrder)) {
      context.addIssue({ code: "custom", path: ["pinOrder"], message: "pin positions must match pin order" });
    }
  });

export type GitHubSnapshotIdentity = z.infer<typeof githubSnapshotIdentitySchema>;
export type GitHubSnapshot = z.infer<typeof githubSnapshotSchema>;

export function hasRequiredEvidenceFailure(snapshot: GitHubSnapshotIdentity): boolean {
  return snapshot.repositories.some((repository) =>
    repository.fetchOutcomes.some((outcome) => outcome.required && outcome.status === "failed"),
  );
}

export function calculateGitHubSnapshotContentHash(snapshot: GitHubSnapshotIdentity): string {
  return sha256(canonicalJson(githubSnapshotIdentitySchema.parse(snapshot)));
}

export function calculateGitHubSnapshotEvidenceHash(snapshot: GitHubSnapshotIdentity): string {
  return sha256(canonicalJson({
    owner: snapshot.owner,
    pinOrder: snapshot.pinOrder,
    repositories: snapshot.repositories.map(({ fetchOutcomes, ...repository }) => {
      void fetchOutcomes;
      return repository;
    }),
  }));
}

export function calculateGitHubSnapshotRenderedHash(snapshot: GitHubSnapshotIdentity): string {
  return sha256(canonicalJson({
    owner: snapshot.owner,
    pinOrder: snapshot.pinOrder,
    repositories: snapshot.repositories.map((repository) => ({
      id: repository.id,
      name: repository.name,
      description: repository.description,
      pinPosition: repository.pinPosition,
      topics: repository.topics,
      languages: repository.languages,
      releases: repository.releases,
      meaningfulActivityAt: repository.meaningfulActivityAt,
      documents: repository.documents.map((document) => ({ kind: document.kind, renderedHash: document.renderedHash })),
    })),
  }));
}

export function githubSnapshotHashesMatch(snapshot: GitHubSnapshot): boolean {
  const identity = {
    owner: snapshot.owner,
    pinOrder: snapshot.pinOrder,
    repositories: snapshot.repositories,
    collectionStatus: snapshot.collectionStatus,
  };
  return (
    snapshot.contentHash === calculateGitHubSnapshotContentHash(identity) &&
    snapshot.evidenceHash === calculateGitHubSnapshotEvidenceHash(identity) &&
    snapshot.renderedContentHash === calculateGitHubSnapshotRenderedHash(identity) &&
    snapshot.id === `github:${snapshot.contentHash.slice(7)}`
  );
}
