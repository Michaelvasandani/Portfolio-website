import { z } from "zod";

import { sha256 } from "./canonical";
import type { ConditionalRepresentation, PublicRepositoryGraph, RestFetchResult } from "./provider";
import {
  calculateGitHubSnapshotContentHash,
  calculateGitHubSnapshotEvidenceHash,
  calculateGitHubSnapshotRenderedHash,
  hasRequiredEvidenceFailure,
  type GitHubEvidenceEndpoint,
  type GitHubSnapshot,
} from "./snapshot-contract";

export {
  calculateGitHubSnapshotContentHash,
  calculateGitHubSnapshotEvidenceHash,
  calculateGitHubSnapshotRenderedHash,
  type GitHubSnapshot,
} from "./snapshot-contract";

export interface GitHubEvidenceProvider {
  fetchRepositoryGraph(owner: string): Promise<PublicRepositoryGraph>;
  fetchRest(endpoint: string, prior?: ConditionalRepresentation): Promise<RestFetchResult>;
}

export interface ConditionalCache {
  get(key: string): Promise<ConditionalRepresentation | undefined>;
  set(key: string, value: ConditionalRepresentation): Promise<void>;
}

type FetchOutcome = {
  endpoint: GitHubEvidenceEndpoint;
  required: boolean;
  status: "success" | "not-modified" | "failed";
  fetchedAt: string;
  httpStatus: number | null;
  attempts: number;
  errorCode?: string;
};

const readmeSchema = z.object({
  path: z.string(),
  html_url: z.url(),
  encoding: z.literal("base64"),
  content: z.string(),
});
const topicsSchema = z.object({ names: z.array(z.string()) });
const languagesSchema = z.record(z.string(), z.number().int().nonnegative());
const releasesSchema = z.array(
  z.object({
    tag_name: z.string(),
    name: z.string().nullable().optional(),
    published_at: z.string().nullable().optional(),
    html_url: z.url(),
  }).passthrough(),
);
const activitySchema = z.array(
  z.object({
    sha: z.string(),
    commit: z.object({
      committer: z.object({ date: z.iso.datetime({ offset: true }).nullable() }).nullable(),
      message: z.string(),
    }),
    author: z.object({ login: z.string() }).nullable(),
  }).passthrough(),
);
const treeSchema = z.object({
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      sha: z.string(),
      size: z.number().int().nonnegative().optional(),
    }).passthrough(),
  ),
  truncated: z.boolean().optional(),
});

const mechanicalPattern = /^(?:chore(?:\([^)]*\))?:|bump |merge (?:branch|pull request)|dependabot|renovate|(?:style|format|fmt|lint)(?:\([^)]*\))?!?:|(?:apply|run) (?:prettier|formatter)|(?:formatting|whitespace)(?: only)?$)/i;

function normalizeSourceText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\n+$/, "") + "\n";
}

function normalizeRenderedText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd() + "\n";
}

function meaningfulActivity(commits: z.infer<typeof activitySchema>): string | null {
  return (
    commits
      .find((commit) => !mechanicalPattern.test(commit.commit.message.split("\n", 1)[0] ?? "") && !/\[bot\]$/i.test(commit.author?.login ?? ""))
      ?.commit.committer?.date ?? null
  );
}

async function fetchEvidence(
  provider: GitHubEvidenceProvider,
  cache: ConditionalCache,
  cacheKey: string,
  endpoint: string,
): Promise<RestFetchResult> {
  const result = await provider.fetchRest(endpoint, await cache.get(cacheKey));
  if (result.status !== "failed" && result.etag) {
    await cache.set(cacheKey, { etag: result.etag, body: result.body });
  }
  return result;
}

function outcome(name: FetchOutcome["endpoint"], required: boolean, result: RestFetchResult, fetchedAt: string): FetchOutcome {
  return result.status === "failed"
    ? { endpoint: name, required, status: "failed", fetchedAt, httpStatus: result.httpStatus, attempts: result.attempts, errorCode: result.errorCode }
    : { endpoint: name, required, status: result.status, fetchedAt, httpStatus: result.httpStatus, attempts: result.attempts };
}

export async function collectGitHubSnapshot(options: {
  owner: string;
  provider: GitHubEvidenceProvider;
  cache: ConditionalCache;
  now?: () => Date;
}): Promise<GitHubSnapshot> {
  const collectedAt = (options.now ?? (() => new Date()))().toISOString();
  const graph = await options.provider.fetchRepositoryGraph(options.owner);
  const pinPositions = new Map(graph.pinnedRepositories.map((repository, index) => [repository.id, index + 1]));
  const repositories: GitHubSnapshot["repositories"] = [];

  for (const repository of graph.repositories) {
    const ownerAndName = repository.nameWithOwner;
    const encoded = ownerAndName.split("/").map(encodeURIComponent).join("/");
    const defaultBranch = repository.defaultBranchRef?.name ?? null;
    const requests = {
      readme: await fetchEvidence(options.provider, options.cache, `${repository.id}:readme`, `/repos/${encoded}/readme`),
      topics: await fetchEvidence(options.provider, options.cache, `${repository.id}:topics`, `/repos/${encoded}/topics`),
      languages: await fetchEvidence(options.provider, options.cache, `${repository.id}:languages`, `/repos/${encoded}/languages`),
      releases: await fetchEvidence(options.provider, options.cache, `${repository.id}:releases`, `/repos/${encoded}/releases?per_page=20`),
      activity: defaultBranch
        ? await fetchEvidence(options.provider, options.cache, `${repository.id}:activity:${defaultBranch}`, `/repos/${encoded}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=20`)
        : ({ status: "failed", httpStatus: 404, attempts: 0, errorCode: "no-default-branch" } as const),
      tree: defaultBranch
        ? await fetchEvidence(options.provider, options.cache, `${repository.id}:tree:${defaultBranch}`, `/repos/${encoded}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`)
        : ({ status: "failed", httpStatus: 404, attempts: 0, errorCode: "no-default-branch" } as const),
    };
    const readme = requests.readme.status === "failed" ? null : readmeSchema.safeParse(requests.readme.body);
    const topics = requests.topics.status === "failed" ? null : topicsSchema.safeParse(requests.topics.body);
    const languages = requests.languages.status === "failed" ? null : languagesSchema.safeParse(requests.languages.body);
    const releases = requests.releases.status === "failed" ? null : releasesSchema.safeParse(requests.releases.body);
    const activity = requests.activity.status === "failed" ? null : activitySchema.safeParse(requests.activity.body);
    const tree = requests.tree.status === "failed" ? null : treeSchema.safeParse(requests.tree.body);
    if ([readme, topics, languages, releases, activity, tree].some((result) => result !== null && !result.success)) {
      throw new Error(`github-rest-invalid-response:${repository.nameWithOwner}`);
    }
    const sourceContent = readme?.success ? normalizeSourceText(Buffer.from(readme.data.content.replace(/\s/g, ""), "base64").toString("utf8")) : null;
    const treeTruncated = tree?.success === true && tree.data.truncated === true;
    const documents: GitHubSnapshot["repositories"][number]["documents"] = sourceContent && readme?.success
      ? [{
          id: `evidence:${repository.id}-readme`,
          kind: "readme",
          path: readme.data.path,
          sourceUrl: readme.data.html_url,
          sourceContent,
          sourceHash: sha256(sourceContent),
          renderedContent: normalizeRenderedText(sourceContent),
          renderedHash: sha256(normalizeRenderedText(sourceContent)),
        }]
      : [];
    repositories.push({
      id: `repository:${repository.id}`,
      nodeId: repository.id,
      name: repository.name,
      nameWithOwner: repository.nameWithOwner,
      url: repository.url,
      description: repository.description,
      homepageUrl: repository.homepageUrl,
      visibility: "public",
      pinPosition: pinPositions.get(repository.id) ?? null,
      archived: repository.isArchived,
      disabled: repository.isDisabled,
      fork: repository.isFork,
      defaultBranch,
      topics: topics?.success ? topics.data.names.map((name) => name.toLocaleLowerCase("en-US")).sort() : [],
      languages: languages?.success
        ? Object.entries(languages.data).map(([name, bytes]) => ({ name, bytes })).sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name))
        : [],
      releases: releases?.success
        ? releases.data.map((release) => ({ tag: release.tag_name, name: release.name ?? null, publishedAt: release.published_at ?? null, sourceUrl: release.html_url }))
        : [],
      meaningfulActivityAt: activity?.success ? meaningfulActivity(activity.data) : null,
      documents,
      sourceStructure: tree?.success && !treeTruncated
        ? tree.data.tree.map((item) => ({ path: item.path, type: item.type, objectHash: item.sha, size: item.size ?? null })).sort((left, right) => left.path.localeCompare(right.path))
        : [],
      fetchOutcomes: [
        outcome("readme", defaultBranch !== null, requests.readme, collectedAt),
        outcome("topics", true, requests.topics, collectedAt),
        outcome("languages", true, requests.languages, collectedAt),
        outcome("releases", false, requests.releases, collectedAt),
        outcome("activity", defaultBranch !== null, requests.activity, collectedAt),
        treeTruncated
          ? { endpoint: "source-structure", required: defaultBranch !== null, status: "failed", fetchedAt: collectedAt, httpStatus: 200, attempts: requests.tree.attempts, errorCode: "source-tree-truncated" }
          : outcome("source-structure", defaultBranch !== null, requests.tree, collectedAt),
      ],
      sourceUrls: [repository.url, ...documents.map((document) => document.sourceUrl)],
    });
  }

  const base = {
    owner: graph.owner,
    pinOrder: graph.pinnedRepositories.map((repository) => `repository:${repository.id}`),
    repositories,
  };
  const identity = {
    ...base,
    collectionStatus: hasRequiredEvidenceFailure({ ...base, collectionStatus: "complete" }) ? "partial" as const : "complete" as const,
  };
  const contentHash = calculateGitHubSnapshotContentHash(identity);
  return {
    schemaVersion: 1,
    id: `github:${contentHash.slice(7)}`,
    contentHash,
    evidenceHash: calculateGitHubSnapshotEvidenceHash(identity),
    renderedContentHash: calculateGitHubSnapshotRenderedHash(identity),
    createdAt: collectedAt,
    collectedAt,
    ...identity,
  };
}
