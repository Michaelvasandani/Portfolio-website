import { describe, expect, it, vi } from "vitest";

import { getRendererFixture } from "../renderer/fixtures";
import { collectGitHubRepositories, generatePortfolioDraft } from "./runtime";

const githubRows = ["one", "two", "three"].map((name, index) => ({
  full_name: `Michaelvasandani/${name}`,
  name,
  html_url: `https://github.com/Michaelvasandani/${name}`,
  description: `Repository ${name}`,
  language: index % 2 ? "Python" : "TypeScript",
  topics: ["agents"],
  updated_at: `2026-08-${String(12 - index).padStart(2, "0")}T00:00:00Z`,
  fork: false,
  archived: false,
}));

const draft = {
  cardProof: "I build dependable agentic systems that convert source evidence into useful software, measurable outcomes, and safe automated decisions.",
  aboutLede: "I build practical agentic software grounded in real project and career evidence.",
  aboutBody: "My work combines reliable automation, retrieval, APIs, and product judgment to turn ambiguous problems into maintainable systems.",
  projects: githubRows.map((repository) => ({
    repositoryFullName: repository.full_name,
    description: `This source-grounded project demonstrates dependable agentic software through documented TypeScript workflows and practical automated systems.`,
  })),
};

describe("production agent runtime", () => {
  it("collects active public GitHub repositories into a bounded evidence contract", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
      ...githubRows,
      { ...githubRows[0], full_name: "Michaelvasandani/fork", name: "fork", fork: true },
      { ...githubRows[0], full_name: "Michaelvasandani/archive", name: "archive", archived: true },
    ]), { status: 200 }));

    const repositories = await collectGitHubRepositories({ username: "Michaelvasandani", fetcher });

    expect(repositories.map(({ fullName }) => fullName)).toEqual(githubRows.map(({ full_name }) => full_name));
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/users/Michaelvasandani/repos"), expect.objectContaining({
      headers: expect.objectContaining({ Accept: "application/vnd.github+json" }),
    }));
  });

  it("uses Vercel OIDC to request and validate schema-constrained model output", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer oidc-token" });
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("openai/gpt-5.4-mini");
      expect(body.response_format.type).toBe("json_schema");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] }), { status: 200 });
    });

    await expect(generatePortfolioDraft({
      repositories: await collectGitHubRepositories({
        username: "Michaelvasandani",
        fetcher: async () => new Response(JSON.stringify(githubRows), { status: 200 }),
      }),
      career: getRendererFixture("typical"),
      token: "oidc-token",
      fetcher,
    })).resolves.toEqual(draft);
  });

  it("fails closed when the gateway response is malformed", async () => {
    await expect(generatePortfolioDraft({
      repositories: [],
      career: getRendererFixture("typical"),
      token: "oidc-token",
      fetcher: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    })).rejects.toThrow("model-response-invalid");
  });
});
