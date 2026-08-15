import { z } from "zod";

import { canonicalJson, sha256 } from "../github/canonical";
import type { GitHubSnapshot } from "../github/snapshot-contract";

const publicUrl = z.url().refine((value) => value.startsWith("https://"), "public links must use HTTPS");
const publicPath = z.string().regex(/^\/(?!\/)/, "artifact paths must be repository-local public paths");
const contentHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);

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

export const verifiedDeploymentScreenshotSchema = z.object({
  kind: z.literal("verified-deployment-screenshot"),
  alt: z.string().min(1),
  source: z.literal("verified-deployment"),
  contentHash,
  src: publicPath,
}).strict();

export const evidenceDerivedDiagramSchema = z.object({
  kind: z.literal("evidence-derived-diagram"),
  alt: z.string().min(1),
  source: z.literal("repository-evidence"),
  contentHash,
  src: publicPath,
}).strict();

export const projectArtifactSchema = z.discriminatedUnion("kind", [
  typesetRepositoryArtifactSchema,
  verifiedDeploymentScreenshotSchema,
  evidenceDerivedDiagramSchema,
]);

export type ProjectArtifact = z.infer<typeof projectArtifactSchema>;

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

export type VerifiedScreenshotCandidate = {
  repositoryUrl: string;
  demonstrationUrl: string;
  publicPath: string;
  alt: string;
  contentHash: string;
  checkedAt: string;
  status: "reachable";
  repositoryIdentityConfirmed: true;
  viewport: { width: 1440; height: 900; deviceScaleFactor: 1 };
};

export type EvidenceDiagramCandidate = {
  publicPath: string;
  alt: string;
  contentHash: string;
  evidencePaths: readonly string[];
  status: "generated";
};

export function selectProjectArtifact(input: {
  repository: GitHubSnapshot["repositories"][number];
  fallback: TypesetRepositoryArtifact;
  screenshot?: VerifiedScreenshotCandidate;
  diagram?: EvidenceDiagramCandidate;
}): { artifact: ProjectArtifact; warnings: string[] } {
  const warnings: string[] = [];
  const screenshot = input.screenshot;
  if (screenshot) {
    let validUrl = false;
    try {
      const candidateUrl = new URL(screenshot.demonstrationUrl);
      const repositoryUrl = new URL(input.repository.url);
      validUrl = candidateUrl.protocol === "https:" && repositoryUrl.protocol === "https:";
    } catch {
      validUrl = false;
    }
    const valid = validUrl &&
      screenshot.repositoryUrl === input.repository.url &&
      screenshot.demonstrationUrl === input.repository.homepageUrl &&
      screenshot.status === "reachable" &&
      screenshot.repositoryIdentityConfirmed === true &&
      screenshot.publicPath.startsWith("/") && !screenshot.publicPath.startsWith("//") &&
      /^sha256:[a-f0-9]{64}$/.test(screenshot.contentHash) &&
      screenshot.viewport.width === 1440 && screenshot.viewport.height === 900 && screenshot.viewport.deviceScaleFactor === 1;
    if (valid) {
      return {
        artifact: verifiedDeploymentScreenshotSchema.parse({
          kind: "verified-deployment-screenshot",
          alt: screenshot.alt,
          source: "verified-deployment",
          contentHash: screenshot.contentHash,
          src: screenshot.publicPath,
        }),
        warnings,
      };
    }
    warnings.push(`screenshot-fallback:${input.repository.id}`);
  }

  const diagram = input.diagram;
  if (diagram) {
    const valid = diagram.status === "generated" && diagram.evidencePaths.length > 0 &&
      diagram.publicPath.startsWith("/") && !diagram.publicPath.startsWith("//") &&
      /^sha256:[a-f0-9]{64}$/.test(diagram.contentHash) && diagram.alt.trim().length > 0;
    if (valid) {
      return {
        artifact: evidenceDerivedDiagramSchema.parse({
          kind: "evidence-derived-diagram",
          alt: diagram.alt,
          source: "repository-evidence",
          contentHash: diagram.contentHash,
          src: diagram.publicPath,
        }),
        warnings,
      };
    }
    warnings.push(`diagram-fallback:${input.repository.id}`);
  }

  return { artifact: input.fallback, warnings };
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
