import { describe, expect, it } from "vitest";

import { GitHubHttpProvider, PINNED_REPOSITORIES_QUERY } from "./provider";

describe("GitHub HTTP provider", () => {
  it("queries public pins and repository graph through GraphQL", async () => {
    const requests: Request[] = [];
    const provider = new GitHubHttpProvider({
      token: "metadata-only-token",
      fetch: async (request) => {
        requests.push(request);
        return Response.json({
          data: {
            user: {
              login: "michael",
              databaseId: 7,
              pinnedItems: { nodes: [] },
              repositories: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
            },
          },
        });
      },
      wait: async () => undefined,
    });

    await provider.fetchRepositoryGraph("michael");

    expect(PINNED_REPOSITORIES_QUERY).toMatch(/pinnedItems\s*\(first:\s*6,\s*types:\s*REPOSITORY\)/);
    expect(PINNED_REPOSITORIES_QUERY).toMatch(/repositories\s*\(first:\s*100/);
    expect(PINNED_REPOSITORIES_QUERY).toMatch(/history\s*\(first:\s*20/);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.github.com/graphql");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer metadata-only-token");
  });

  it("sends conditional REST headers and returns cached content on 304", async () => {
    const requests: Request[] = [];
    const provider = new GitHubHttpProvider({
      token: "metadata-only-token",
      fetch: async (request) => {
        requests.push(request);
        return new Response(null, { status: 304, headers: { etag: '"readme-v1"' } });
      },
      wait: async () => undefined,
    });

    const result = await provider.fetchRest("/repos/michael/portfolio/readme", {
      etag: '"readme-v1"',
      body: { content: "cached", encoding: "base64" },
    });

    expect(requests[0]?.headers.get("if-none-match")).toBe('"readme-v1"');
    expect(result).toEqual({
      status: "not-modified",
      httpStatus: 304,
      etag: '"readme-v1"',
      body: { content: "cached", encoding: "base64" },
      attempts: 1,
    });
  });

  it("bounds retryable failures at three attempts", async () => {
    let attempts = 0;
    const provider = new GitHubHttpProvider({
      token: "metadata-only-token",
      fetch: async () => {
        attempts += 1;
        return new Response("unavailable", { status: 503 });
      },
      wait: async () => undefined,
    });

    const result = await provider.fetchRest("/repos/michael/portfolio/languages");

    expect(attempts).toBe(3);
    expect(result).toMatchObject({ status: "failed", httpStatus: 503, attempts: 3 });
  });
});
