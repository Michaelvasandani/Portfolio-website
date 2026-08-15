import { z } from "zod";

import { canonicalJson, sha256 } from "../github/canonical";
import type { GitHubSnapshot } from "../github/snapshot-contract";

const publicUrl = z.url().refine((value) => value.startsWith("https://"), "public links must use HTTPS");

export const typesetRepositoryArtifactSchema = z.object({
  kind: z.literal("typeset-repository"),
  alt: z.string().min(1),
  source: z.literal("public-repository"),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  repositoryName: z.string().min(1),
  description: z.string().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  metadata: z.object({
    lastUpdated: z.iso.datetime({ offset: true }).nullable(),
    releaseCount: z.number().int().nonnegative(),
    pinned: z.boolean(),
  }).strict(),
  repositoryHref: publicUrl,
}).strict();

export type TypesetRepositoryArtifact = z.infer<typeof typesetRepositoryArtifactSchema>;

type RepositoryArtifactInput = {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  topics: readonly string[];
  lastUpdated: string | null;
  releaseCount: number;
  pinned: boolean;
};

export function createTypesetRepositoryArtifact(input: RepositoryArtifactInput): TypesetRepositoryArtifact {
  const content = {
    repositoryName: input.name,
    description: input.description,
    language: input.language,
    topics: [...input.topics],
    metadata: {
      lastUpdated: input.lastUpdated,
      releaseCount: input.releaseCount,
      pinned: input.pinned,
    },
    repositoryHref: input.url,
  };
  return typesetRepositoryArtifactSchema.parse({
    kind: "typeset-repository",
    alt: `Typeset public repository evidence for ${input.name}`,
    source: "public-repository",
    contentHash: sha256(canonicalJson(content)),
    ...content,
  });
}

export function createTypesetArtifactFromRepository(
  repository: GitHubSnapshot["repositories"][number],
): TypesetRepositoryArtifact {
  return createTypesetRepositoryArtifact({
    name: repository.name,
    url: repository.url,
    description: repository.description,
    language: repository.languages[0]?.name ?? null,
    topics: repository.topics,
    lastUpdated: repository.meaningfulActivityAt,
    releaseCount: repository.releases.length,
    pinned: repository.pinPosition !== null,
  });
}

export type ProjectProminenceInput = {
  repositoryId: string;
  order: number;
  relevance: number;
};

export function prominenceByRepositoryId(selected: readonly ProjectProminenceInput[]): ReadonlyMap<string, "wide" | "compact"> {
  const wide = new Set(
    [...selected]
      .sort((left, right) => right.relevance - left.relevance || left.order - right.order)
      .slice(0, 2)
      .map(({ repositoryId }) => repositoryId),
  );
  return new Map(selected.map(({ repositoryId }) => [repositoryId, wide.has(repositoryId) ? "wide" : "compact"]));
}

export function artifactEvidenceFieldPaths(repository: GitHubSnapshot["repositories"][number]): string[] {
  const root = `repositories.${repository.id}`;
  return [
    `${root}.name`,
    `${root}.url`,
    ...(repository.description ? [`${root}.description`] : []),
    ...repository.topics.map((_, index) => `${root}.topics.${index}`),
    ...repository.languages.map((_, index) => `${root}.languages.${index}`),
    ...(repository.meaningfulActivityAt ? [`${root}.meaningfulActivityAt`] : []),
    ...repository.releases.map((_, index) => `${root}.releases.${index}.tag`),
    ...(repository.pinPosition !== null ? [`${root}.pinPosition`] : []),
  ];
}
