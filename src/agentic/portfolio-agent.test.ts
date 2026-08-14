import { describe, expect, it, vi } from "vitest";

import { getRendererFixture } from "../renderer/fixtures";
import {
  buildPublishedPortfolio,
  runPortfolioAgent,
  type AgentDraft,
  type RepositoryEvidence,
} from "./portfolio-agent";

const repositories: RepositoryEvidence[] = [
  {
    fullName: "Michaelvasandani/Hackathon-In-A-Box",
    name: "Hackathon-In-A-Box",
    url: "https://github.com/Michaelvasandani/Hackathon-In-A-Box",
    description: "An agentic hackathon planning platform.",
    language: "TypeScript",
    topics: ["agents", "postgresql"],
    updatedAt: "2026-08-12T00:00:00.000Z",
    fork: false,
    archived: false,
  },
  {
    fullName: "Michaelvasandani/SafeTrip-SF",
    name: "SafeTrip-SF",
    url: "https://github.com/Michaelvasandani/SafeTrip-SF",
    description: "A source-grounded trip planning system.",
    language: "Python",
    topics: ["langgraph", "pgvector"],
    updatedAt: "2026-08-11T00:00:00.000Z",
    fork: false,
    archived: false,
  },
  {
    fullName: "Michaelvasandani/Voice-Agent",
    name: "Voice-Agent",
    url: "https://github.com/Michaelvasandani/Voice-Agent",
    description: "A voice agent with calendar integrations.",
    language: "TypeScript",
    topics: ["voice", "calendar"],
    updatedAt: "2026-08-10T00:00:00.000Z",
    fork: false,
    archived: false,
  },
];

const draft: AgentDraft = {
  cardProof: "I build dependable agentic systems that convert source evidence into useful software, measurable outcomes, and safe automated decisions.",
  aboutLede: "I build practical agentic software grounded in real project and career evidence.",
  aboutBody: "My work combines reliable automation, retrieval, APIs, and product judgment to turn ambiguous problems into maintainable systems.",
  projects: [
    {
      repositoryFullName: repositories[0]!.fullName,
      description: "An agentic planning platform that grounds event recommendations in sources and guides nonprofit teams through a complete workflow.",
    },
    {
      repositoryFullName: repositories[1]!.fullName,
      description: "A trip planner that grounds itineraries in safety evidence through LangGraph, PostgreSQL, and vector retrieval workflows.",
    },
    {
      repositoryFullName: repositories[2]!.fullName,
      description: "A TypeScript voice agent that verifies webhooks, checks calendars, books meetings, and produces structured call summaries.",
    },
  ],
};

describe("portfolio agent", () => {
  it("builds a validated public fixture using only collected repository identities", () => {
    const fixture = buildPublishedPortfolio({
      base: getRendererFixture("typical"),
      repositories,
      draft,
      publishedAt: "2026-08-13T12:00:00.000Z",
    });

    expect(fixture.projects.map(({ repositoryHref }) => repositoryHref)).toEqual(repositories.map(({ url }) => url));
    expect(fixture.projects[0]?.bullets).toEqual(getRendererFixture("typical").careerProjects[0]?.bullets);
    expect(fixture.lastUpdated).toBe("2026-08-13T12:00:00.000Z");
    expect(fixture.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects a model-selected repository that was not collected", () => {
    expect(() => buildPublishedPortfolio({
      base: getRendererFixture("typical"),
      repositories,
      draft: {
        ...draft,
        projects: [{ ...draft.projects[0]!, repositoryFullName: "attacker/untrusted" }, ...draft.projects.slice(1)],
      },
      publishedAt: "2026-08-13T12:00:00.000Z",
    })).toThrow("uncollected-repository");
  });

  it("publishes only after collection, generation, and validation all succeed", async () => {
    const publish = vi.fn(async () => undefined);
    const result = await runPortfolioAgent({
      collect: async () => repositories,
      generate: async () => draft,
      publish,
      base: getRendererFixture("typical"),
      now: () => new Date("2026-08-13T12:00:00.000Z"),
    });

    expect(result.status).toBe("published");
    expect(publish).toHaveBeenCalledOnce();
  });

  it("preserves the last valid publication when generation fails", async () => {
    const publish = vi.fn(async () => undefined);

    await expect(runPortfolioAgent({
      collect: async () => repositories,
      generate: async () => { throw new Error("model-unavailable"); },
      publish,
      base: getRendererFixture("typical"),
      now: () => new Date("2026-08-13T12:00:00.000Z"),
    })).rejects.toThrow("model-unavailable");
    expect(publish).not.toHaveBeenCalled();
  });
});
