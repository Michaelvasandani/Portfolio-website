import { describe, expect, it } from "vitest";

import {
  collectGitHubSnapshot,
  type ConditionalCache,
  type GitHubEvidenceProvider,
} from "./collector";

const collectedAt = new Date("2026-08-12T09:17:00.000Z");

function graph() {
  const portfolio = {
    id: "R_portfolio",
    name: "portfolio",
    nameWithOwner: "michael/portfolio",
    url: "https://github.com/michael/portfolio",
    description: "A portfolio",
    homepageUrl: "https://example.com",
    isArchived: false,
    isDisabled: false,
    isFork: false,
    defaultBranchRef: {
      name: "main",
      target: {
        history: {
          nodes: [
            {
              oid: "a".repeat(40),
              committedDate: "2026-08-11T10:00:00.000Z",
              messageHeadline: "chore(deps): bump zod",
              authorLogin: "dependabot[bot]",
            },
            {
              oid: "b".repeat(40),
              committedDate: "2026-08-10T10:00:00.000Z",
              messageHeadline: "Add signed ingestion",
              authorLogin: "michael",
            },
          ],
        },
      },
    },
  };
  const second = {
    ...portfolio,
    id: "R_second",
    name: "second",
    nameWithOwner: "michael/second",
    url: "https://github.com/michael/second",
    description: null,
    homepageUrl: null,
    defaultBranchRef: null,
  };
  return {
    owner: { login: "michael", numericId: "7" },
    pinnedRepositories: [second, portfolio],
    repositories: [portfolio, second],
  };
}

function restBody(endpoint: string): unknown {
  if (endpoint.endsWith("/readme")) {
    return {
      path: "README.md",
      html_url: "https://github.com/michael/portfolio/blob/main/README.md",
      encoding: "base64",
      content: Buffer.from("# Portfolio\r\n\r\nDependable systems.  \r\n").toString("base64"),
    };
  }
  if (endpoint.endsWith("/topics")) return { names: ["NextJS", "Agents"] };
  if (endpoint.endsWith("/languages")) return { TypeScript: 1200, CSS: 300 };
  if (endpoint.includes("/releases")) return [];
  if (endpoint.includes("/commits")) {
    return [
      {
        sha: "a".repeat(40),
        commit: { committer: { date: "2026-08-11T10:00:00.000Z" }, message: "chore(deps): bump zod" },
        author: { login: "dependabot[bot]" },
      },
      {
        sha: "b".repeat(40),
        commit: { committer: { date: "2026-08-10T11:00:00.000Z" }, message: "format: apply prettier" },
        author: { login: "michael" },
      },
      {
        sha: "c".repeat(40),
        commit: { committer: { date: "2026-08-10T10:00:00.000Z" }, message: "Add signed ingestion" },
        author: { login: "michael" },
      },
    ];
  }
  if (endpoint.includes("/git/trees/")) {
    return { tree: [{ path: "src/index.ts", type: "blob", sha: "tree-sha", size: 120 }] };
  }
  throw new Error(`unhandled endpoint ${endpoint}`);
}

function provider(mode: "success" | "not-modified" = "success") {
  const calls: Array<{ endpoint: string; etag?: string }> = [];
  const value: GitHubEvidenceProvider = {
    fetchRepositoryGraph: async () => graph(),
    fetchRest: async (endpoint, prior) => {
      calls.push({ endpoint, etag: prior?.etag });
      const body = prior?.body ?? restBody(endpoint);
      return {
        status: mode === "not-modified" && prior ? "not-modified" : "success",
        httpStatus: mode === "not-modified" && prior ? 304 : 200,
        etag: '"fixture-v1"',
        body,
        attempts: 1,
      };
    },
  };
  return { value, calls };
}

class MemoryCache implements ConditionalCache {
  readonly values = new Map<string, { etag: string; body: unknown }>();
  async get(key: string) {
    return this.values.get(key);
  }
  async set(key: string, value: { etag: string; body: unknown }) {
    this.values.set(key, value);
  }
}

describe("GitHub evidence collector", () => {
  it("captures current public pin order and normalized required evidence", async () => {
    const cache = new MemoryCache();
    const fixture = provider();

    const snapshot = await collectGitHubSnapshot({
      owner: "michael",
      provider: fixture.value,
      cache,
      now: () => collectedAt,
    });

    expect(snapshot.pinOrder).toEqual(["repository:R_second", "repository:R_portfolio"]);
    const portfolio = snapshot.repositories.find((repository) => repository.name === "portfolio");
    expect(portfolio).toMatchObject({
      pinPosition: 2,
      topics: ["agents", "nextjs"],
      languages: [
        { name: "TypeScript", bytes: 1200 },
        { name: "CSS", bytes: 300 },
      ],
      meaningfulActivityAt: "2026-08-10T10:00:00.000Z",
    });
    expect(portfolio?.documents[0]).toMatchObject({
      kind: "readme",
      path: "README.md",
      sourceContent: "# Portfolio\n\nDependable systems.  \n",
      renderedContent: "# Portfolio\n\nDependable systems.\n",
    });
    expect(portfolio?.sourceStructure).toEqual([
      { path: "src/index.ts", type: "blob", objectHash: "tree-sha", size: 120 },
    ]);
    expect(fixture.calls.some((call) => call.endpoint.includes("/commits?sha=main&per_page=20"))).toBe(true);
    expect(portfolio?.fetchOutcomes.find((item) => item.endpoint === "activity")).toMatchObject({ status: "success" });
    expect(snapshot.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.renderedContentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(snapshot.collectionStatus).toBe("complete");
  });

  it("uses conditional responses without changing normalized hashes", async () => {
    const cache = new MemoryCache();
    const firstProvider = provider();
    const first = await collectGitHubSnapshot({ owner: "michael", provider: firstProvider.value, cache, now: () => collectedAt });
    const secondProvider = provider("not-modified");
    const second = await collectGitHubSnapshot({
      owner: "michael",
      provider: secondProvider.value,
      cache,
      now: () => new Date("2026-08-13T09:17:00.000Z"),
    });

    expect(secondProvider.calls.every((call) => call.etag === '"fixture-v1"')).toBe(true);
    expect(second.repositories.flatMap((repository) => repository.fetchOutcomes).filter((outcome) => outcome.attempts > 0).every((outcome) => outcome.status === "not-modified")).toBe(true);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(second.evidenceHash).toBe(first.evidenceHash);
    expect(second.renderedContentHash).toBe(first.renderedContentHash);
  });

  it("records optional partial failures instead of fabricating evidence", async () => {
    const fixture = provider();
    fixture.value.fetchRest = async (endpoint) =>
      endpoint.endsWith("/releases?per_page=20")
        ? { status: "failed", httpStatus: 503, attempts: 3, errorCode: "github-unavailable" }
        : { status: "success", httpStatus: 200, attempts: 1, etag: '"v1"', body: restBody(endpoint) };

    const snapshot = await collectGitHubSnapshot({ owner: "michael", provider: fixture.value, cache: new MemoryCache(), now: () => collectedAt });
    const outcome = snapshot.repositories[0]?.fetchOutcomes.find((item) => item.endpoint === "releases");

    expect(outcome).toMatchObject({ status: "failed", httpStatus: 503, attempts: 3, errorCode: "github-unavailable" });
    expect(outcome).toMatchObject({ required: false });
    expect(snapshot.repositories[0]?.releases).toEqual([]);
    expect(snapshot.collectionStatus).toBe("complete");
  });

  it("marks required endpoint failures incomplete so they cannot replace a valid snapshot", async () => {
    const fixture = provider();
    fixture.value.fetchRest = async (endpoint) =>
      endpoint.endsWith("/topics")
        ? { status: "failed", httpStatus: 503, attempts: 3, errorCode: "github-unavailable" }
        : { status: "success", httpStatus: 200, attempts: 1, etag: '"v1"', body: restBody(endpoint) };

    const snapshot = await collectGitHubSnapshot({ owner: "michael", provider: fixture.value, cache: new MemoryCache(), now: () => collectedAt });
    const failed = snapshot.repositories[0]?.fetchOutcomes.find((item) => item.endpoint === "topics");

    expect(failed).toMatchObject({ status: "failed", required: true });
    expect(snapshot.collectionStatus).toBe("partial");
  });

  it("marks a truncated source tree as partial instead of treating it as complete", async () => {
    const fixture = provider();
    const baseFetch = fixture.value.fetchRest;
    fixture.value.fetchRest = async (endpoint, prior) => endpoint.includes("/git/trees/")
      ? {
          status: "success",
          httpStatus: 200,
          attempts: 1,
          etag: '"truncated"',
          body: { truncated: true, tree: [{ path: "src/index.ts", type: "blob", sha: "tree-sha", size: 120 }] },
        }
      : baseFetch(endpoint, prior);

    const snapshot = await collectGitHubSnapshot({ owner: "michael", provider: fixture.value, cache: new MemoryCache(), now: () => collectedAt });
    const repository = snapshot.repositories.find((item) => item.name === "portfolio");

    expect(repository?.sourceStructure).toEqual([]);
    expect(repository?.fetchOutcomes.find((item) => item.endpoint === "source-structure")).toMatchObject({
      status: "failed",
      errorCode: "source-tree-truncated",
    });
  });

  it("separates source-only README changes from rendered-content changes", async () => {
    const cache = new MemoryCache();
    const firstProvider = provider();
    const baseFetch = firstProvider.value.fetchRest;
    firstProvider.value.fetchRest = async (endpoint, prior) => endpoint.endsWith("/readme")
      ? {
          status: "success",
          httpStatus: 200,
          attempts: 1,
          etag: '"readme-comment-1"',
          body: {
            path: "README.md",
            html_url: "https://github.com/michael/portfolio/blob/main/README.md",
            encoding: "base64",
            content: Buffer.from("# Portfolio\n<!-- internal note one -->\nDependable systems.\n").toString("base64"),
          },
        }
      : baseFetch(endpoint, prior);
    const first = await collectGitHubSnapshot({ owner: "michael", provider: firstProvider.value, cache, now: () => collectedAt });

    const secondProvider = provider();
    const secondBaseFetch = secondProvider.value.fetchRest;
    secondProvider.value.fetchRest = async (endpoint, prior) => endpoint.endsWith("/readme")
      ? {
          status: "success",
          httpStatus: 200,
          attempts: 1,
          etag: '"readme-comment-2"',
          body: {
            path: "README.md",
            html_url: "https://github.com/michael/portfolio/blob/main/README.md",
            encoding: "base64",
            content: Buffer.from("# Portfolio\n<!-- internal note two -->\nDependable systems.\n").toString("base64"),
          },
        }
      : secondBaseFetch(endpoint, prior);
    const second = await collectGitHubSnapshot({ owner: "michael", provider: secondProvider.value, cache, now: () => collectedAt });

    expect(second.contentHash).not.toBe(first.contentHash);
    expect(second.evidenceHash).not.toBe(first.evidenceHash);
    expect(second.renderedContentHash).toBe(first.renderedContentHash);
  });
});
