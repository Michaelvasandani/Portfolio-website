import { describe, expect, it } from "vitest";

import { reconcileProjects } from "./selection";
import { makeCompositionInput, repositoryProfile } from "./test-fixtures";

describe("project selection", () => {
  it("enforces eligibility, scoring, pin precedence, target size, ties, and diversity", () => {
    const input = makeCompositionInput({
      repositories: [
        repositoryProfile("pin-low", { pinPosition: 1, relevance: 4, evidence: 10 }),
        repositoryProfile("a-top", { relevance: 10, evidence: 20 }),
        repositoryProfile("diverse", { relevance: 8, evidence: 15, diversity: ["health", "cli", "retrieval"] }),
        repositoryProfile("same", { relevance: 10, evidence: 20 }),
        repositoryProfile("weak", { substantive: false, relevance: 10, evidence: 20 }),
        repositoryProfile("archive", { archived: true, relevance: 10, evidence: 20 }),
      ],
      projectTarget: 3,
    });

    const result = reconcileProjects(input);

    expect(result.evaluations.find(({ repositoryName }) => repositoryName === "weak")?.eligible).toBe(false);
    expect(result.evaluations.find(({ repositoryName }) => repositoryName === "archive")?.eligible).toBe(false);
    expect(result.selected.map(({ repositoryName }) => repositoryName)).toEqual(["pin-low", "a-top", "diverse"]);
    expect(result.selected.find(({ repositoryName }) => repositoryName === "pin-low")?.score.pin).toBe(35);
    expect(result.evaluations.find(({ repositoryName }) => repositoryName === "a-top")?.score.total).toBe(35);
  });

  it("does not treat source structure and tests as separate corroborating evidence classes", () => {
    const input = makeCompositionInput({ repositories: [repositoryProfile("tree-only")] });
    const repository = input.github.repositories[0]!;
    repository.description = null;
    repository.topics = [];
    repository.documents = [];
    repository.meaningfulActivityAt = null;

    expect(reconcileProjects(input).evaluations[0]).toMatchObject({
      eligible: false,
      ineligibleReasons: expect.arrayContaining(["insufficient-evidence"]),
    });
  });

  it("selects all six eligible pins and publishes fewer than five when fewer qualify", () => {
    const six = makeCompositionInput({
      repositories: Array.from({ length: 6 }, (_, index) =>
        repositoryProfile(`pin-${index + 1}`, { pinPosition: index + 1 }),
      ),
    });
    expect(reconcileProjects(six).selected).toHaveLength(6);

    const sparse = makeCompositionInput({
      repositories: [
        repositoryProfile("one"),
        repositoryProfile("two"),
        repositoryProfile("nope", { substantive: false }),
      ],
    });
    expect(reconcileProjects(sparse).selected.map(({ repositoryName }) => repositoryName)).toEqual(["one", "two"]);
  });

  it("records direct, corroborated alias, and ambiguous résumé matches without scoring ambiguity", () => {
    const input = makeCompositionInput({ matching: true });
    const result = reconcileProjects(input);
    const direct = result.evaluations.find(({ repositoryName }) => repositoryName === "direct")!;
    const alias = result.evaluations.find(({ repositoryName }) => repositoryName === "voice-agent")!;
    const ambiguous = result.evaluations.find(({ repositoryName }) => repositoryName === "ambiguous")!;

    expect(direct.match.kind).toBe("direct-url");
    expect(direct.score.resumeMatch).toBe(30);
    expect(alias.match.kind).toBe("alias-corroborated");
    expect(alias.score.resumeMatch).toBe(30);
    expect(ambiguous.match.kind).toBe("ambiguous");
    expect(ambiguous.score.resumeMatch).toBe(0);
  });

  it("does not accept invented corroborating paths", () => {
    const input = makeCompositionInput({ matching: true });
    const profile = input.profiles.find(({ repositoryId }) => repositoryId === "repository:voice-agent")!;
    profile.aliasMatches = [{
      careerProjectId: "project:voice",
      alias: "Personal Call Agent",
      corroboratingFacts: [
        { careerPath: "projects.project:voice.missing.0", githubPath: "repositories.repository:voice-agent.missing.0" },
        { careerPath: "projects.project:voice.missing.1", githubPath: "repositories.repository:voice-agent.missing.1" },
      ],
    }];

    expect(reconcileProjects(input).evaluations.find(({ repositoryName }) => repositoryName === "voice-agent")?.match.kind).toBe("none");
  });

  it("requires an eight-point lead twice and preserves recency-only order", () => {
    const firstInput = makeCompositionInput({
      projectTarget: 1,
      repositories: [
        repositoryProfile("incumbent", { relevance: 4, evidence: 10 }),
        repositoryProfile("challenger", { relevance: 10, evidence: 20 }),
      ],
      priorSelected: ["incumbent"],
    });
    const first = reconcileProjects(firstInput);
    expect(first.selected.map(({ repositoryName }) => repositoryName)).toEqual(["incumbent"]);
    expect(first.comparisons).toContainEqual(expect.objectContaining({ challengerRepositoryId: "repository:challenger", consecutiveRuns: 1 }));

    const second = reconcileProjects({ ...firstInput, priorState: first.state });
    expect(second.selected.map(({ repositoryName }) => repositoryName)).toEqual(["challenger"]);

    const recencyInput = makeCompositionInput({
      projectTarget: 2,
      repositories: [
        repositoryProfile("older-first", { evidence: 20, relevance: 10, meaningfulActivityAt: "2026-08-10T00:00:00.000Z" }),
        repositoryProfile("newer-second", { evidence: 20, relevance: 10, meaningfulActivityAt: "2026-08-11T00:00:00.000Z" }),
      ],
      priorSelected: ["older-first", "newer-second"],
      previousEvaluations: {
        "repository:older-first": { pin: 0, resumeMatch: 0, evidence: 20, relevance: 10, recency: 3, total: 33 },
        "repository:newer-second": { pin: 0, resumeMatch: 0, evidence: 20, relevance: 10, recency: 5, total: 35 },
      },
    });
    expect(reconcileProjects(recencyInput).selected.map(({ repositoryName }) => repositoryName)).toEqual([
      "older-first",
      "newer-second",
    ]);
  });
});
