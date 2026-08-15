import { describe, expect, it } from "vitest";

import { composeCandidate } from "./compose";
import type { GeneratorRequest } from "./contracts";
import { DeterministicLocalGenerator } from "./generator";
import { independentPublicLeakScan } from "./projection";
import { createTypesetArtifactFromRepository } from "./project-presentation";
import { makeCompositionInput, repositoryProfile } from "./test-fixtures";

describe("candidate composition", () => {
  it("assembles a complete deterministic Public projection, résumé inputs, and private evidence graph", async () => {
    const input = makeCompositionInput({ matching: true });
    const first = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });
    const second = await composeCandidate({ ...structuredClone(input), generator: new DeterministicLocalGenerator() });

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    if (first.status !== "accepted" || second.status !== "accepted") return;

    expect(first.candidate.hashes).toEqual(second.candidate.hashes);
    expect(first.candidate.publicProjection.sections.map(({ kind }) => kind)).toEqual([
      "card",
      "about",
      "experience",
      "projects",
      "resume",
      "links",
    ]);
    expect(first.candidate.publicProjection.resume.html).toEqual(first.candidate.publicProjection.resume.pdf);
    expect(first.candidate.completeness.missing).toEqual([]);
    expect(first.candidate.completeness.duplicates).toEqual([]);
    expect(first.candidate.manifest.evidenceGraph.every(({ references }) => references.length > 0)).toBe(true);
    expect(independentPublicLeakScan(first.candidate.publicProjection)).toEqual([]);
    expect(JSON.stringify(first.candidate.publicProjection)).not.toContain(input.career.sourceDocumentHash);
    expect(first.candidate.hashes.semanticSourceHash).not.toBe(first.candidate.hashes.renderedContentHash);
  });

  it("rejects a material source conflict without mutating snapshots, prior selection, or last-valid state", async () => {
    const input = makeCompositionInput({ sourceConflict: true });
    const before = structuredClone(input);
    const result = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });

    expect(result).toMatchObject({ status: "rejected", code: "material-source-conflict" });
    expect(input).toEqual(before);
    expect(result.preserved).toEqual({
      careerSnapshotId: input.career.id,
      githubSnapshotId: input.github.id,
      priorSelectionStateId: input.priorState?.id ?? null,
      lastValidCandidateId: input.lastValidCandidateId,
    });
  });

  it("rejects failed model output and preserves all pinned state", async () => {
    const input = makeCompositionInput();
    const result = await composeCandidate({
      ...input,
      generator: new DeterministicLocalGenerator({ mutation: { evidenceIds: ["evidence:unknown"] } }),
    });

    expect(result).toMatchObject({ status: "rejected", code: "generation-invalid" });
    expect(result.preserved.priorSelectionStateId).toBe(input.priorState?.id ?? null);
    expect(result.preserved.lastValidCandidateId).toBe(input.lastValidCandidateId);
  });

  it("reuses validated prior narrative when semantic evidence is unchanged", async () => {
    const input = makeCompositionInput();
    let calls = 0;
    const generator = {
      generate: async (request: Parameters<DeterministicLocalGenerator["generate"]>[0]) => {
        calls += 1;
        return new DeterministicLocalGenerator().generate(request);
      },
    };
    const first = await composeCandidate({ ...input, generator });
    expect(first.status).toBe("accepted");
    if (first.status !== "accepted") return;
    const second = await composeCandidate({
      ...structuredClone(input),
      generator,
      priorNarrative: {
        requestEvidenceHashes: first.candidate.manifest.requestEvidenceHashes,
        output: first.candidate.manifest.generatedOutput,
      },
    });
    expect(second.status).toBe("accepted");
    expect(calls).toBe(1);
  });

  it("requests one evidence-bound story per Career snapshot role while keeping the Public résumé verbatim", async () => {
    const input = makeCompositionInput();
    const requests: GeneratorRequest[] = [];
    const generator = {
      generate: async (request: GeneratorRequest) => {
        requests.push(request);
        return new DeterministicLocalGenerator().generate(request);
      },
    };

    const result = await composeCandidate({ ...input, generator });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    const storyRequest = requests[0]?.requests.find(({ placement }) => placement === "experience");
    const story = result.candidate.manifest.generatedOutput.sentences.find(({ requestId }) => requestId === "experience.experience:engineer");
    const roleEvidenceIds = result.candidate.manifest.evidencePacket
      .filter(({ fieldPath }) => fieldPath.startsWith("experience.experience:engineer.bullets."))
      .map(({ id }) => id);

    expect(requests[0]?.requests.filter(({ placement }) => placement === "experience")).toHaveLength(input.career.experience.length);
    expect(storyRequest?.evidenceIds).toEqual(roleEvidenceIds);
    expect(story?.clauses.flatMap(({ evidenceIds }) => evidenceIds)).toEqual(expect.arrayContaining(roleEvidenceIds));
    expect(result.candidate.publicProjection.resume.html.experience[0]?.bullets).toEqual([
      "Built dependable agentic software systems.",
      "Shipped tested data services.",
    ]);
  });

  it("regenerates only copy whose recorded supporting evidence changed", async () => {
    const input = makeCompositionInput({ matching: true });
    const requested: string[][] = [];
    const generator = {
      generate: async (request: Parameters<DeterministicLocalGenerator["generate"]>[0]) => {
        requested.push(request.requests.map(({ id }) => id));
        return new DeterministicLocalGenerator().generate(request);
      },
    };
    const first = await composeCandidate({ ...input, generator });
    expect(first.status).toBe("accepted");
    if (first.status !== "accepted") return;
    const changed = structuredClone(input);
    changed.github.repositories.find(({ id }) => id === "repository:ambiguous")!.description = "Ambiguous tested Python automation for documented workflows";
    const second = await composeCandidate({
      ...changed,
      generator,
      priorNarrative: {
        requestEvidenceHashes: first.candidate.manifest.requestEvidenceHashes,
        output: first.candidate.manifest.generatedOutput,
      },
    });
    expect(second.status).toBe("accepted");
    expect(requested[1]).toEqual(["project.repository:ambiguous"]);
  });

  it("selects and audits the repository-owned fallback thesis when sources do not support agentic AI", async () => {
    const input = makeCompositionInput();
    input.career.experience[0]!.title.original = "Software Engineer";
    input.career.experience[0]!.bullets[0]!.text.original = "Built dependable software systems.";
    input.career.projects.forEach((project) => {
      project.name.original = "Software Project";
      project.bullets.forEach((bullet) => { bullet.text.original = "Built tested software."; });
    });
    input.github.repositories.forEach((repository) => {
      repository.description = "Dependable software automation";
      repository.topics = ["software"];
      repository.documents.forEach((document) => { document.renderedContent = "Documented tested software implementation."; });
    });

    const result = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") expect(result.candidate.manifest.thesis.selected).toBe("fallback");
  });

  it("rejects safely when a required contact is missing", async () => {
    const input = makeCompositionInput();
    input.career.person.contacts = input.career.person.contacts.filter(({ kind }) => kind !== "linkedin");

    await expect(composeCandidate({ ...input, generator: new DeterministicLocalGenerator() })).resolves.toMatchObject({
      status: "rejected",
      code: "completeness-invalid",
      preserved: { lastValidCandidateId: input.lastValidCandidateId },
    });
  });

  it("publishes a live demo only when the assessment binds it to verified GitHub evidence", async () => {
    const input = makeCompositionInput();
    input.github.repositories[0]!.homepageUrl = "https://portfolio.example.com";
    const unverified = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });
    expect(unverified.status).toBe("accepted");
    if (unverified.status !== "accepted") return;
    expect(unverified.candidate.publicProjection.sections[3].entries[0]!.demonstrationHref).toBeUndefined();

    input.profiles[0]!.verifiedDemonstration = {
      fieldPath: "repositories.repository:portfolio.homepageUrl",
      url: "https://portfolio.example.com",
      checkedAt: input.runAt,
      status: "reachable",
      repositoryIdentityConfirmed: true,
    };
    const verified = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });
    expect(verified.status).toBe("accepted");
    if (verified.status === "accepted") {
      expect(verified.candidate.publicProjection.sections[3].entries[0]!.demonstrationHref).toBe("https://portfolio.example.com");
    }
  });

  it("keeps autonomous selection membership while assigning wide prominence by AI relevance", async () => {
    const input = makeCompositionInput({
      projectTarget: 3,
      repositories: [
        repositoryProfile("lower-relevance", { relevance: 4 }),
        repositoryProfile("highest-relevance", { relevance: 10 }),
        repositoryProfile("tied-relevance", { relevance: 10 }),
      ],
    });
    const selection = (await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() }));

    expect(selection.status).toBe("accepted");
    if (selection.status !== "accepted") return;

    const selectedIds = selection.candidate.selectionState.selected.map(({ repositoryId }) => repositoryId);
    const projectEntries = selection.candidate.publicProjection.sections[3].entries;
    expect(projectEntries.map(({ repositoryHref }) => repositoryHref.replace("https://github.com/michael/", ""))).toEqual(
      selection.candidate.selectionState.selected.map(({ repositoryName }) => repositoryName),
    );
    expect(projectEntries.filter(({ prominence }) => prominence === "wide")).toHaveLength(2);
    expect(projectEntries.filter(({ prominence }) => prominence === "compact")).toHaveLength(1);
    expect(selectedIds).toHaveLength(3);
  });

  it("builds a complete typeset artifact from public repository metadata and records private provenance", async () => {
    const input = makeCompositionInput({
      projectTarget: 1,
      repositories: [repositoryProfile("artifact", { relevance: 10 })],
    });
    const repository = input.github.repositories[0]!;
    repository.description = null;
    repository.topics = ["verified-topic"];
    repository.languages = [{ name: "TypeScript", bytes: 10_000 }];
    repository.meaningfulActivityAt = "2026-08-11T00:00:00.000Z";
    repository.releases = [{
      tag: "v1.0.0",
      name: "First release",
      publishedAt: "2026-08-11T00:00:00.000Z",
      sourceUrl: "https://github.com/michael/artifact/releases/tag/v1.0.0",
    }];

    const result = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    const project = result.candidate.publicProjection.sections[3].entries[0]!;
    expect(project.artifact).toMatchObject({
      kind: "typeset-repository",
      source: "public-repository",
      repositoryName: "artifact",
      description: null,
      language: "TypeScript",
      topics: ["verified-topic"],
      metadata: {
        lastUpdated: "2026-08-11T00:00:00.000Z",
        releaseCount: 1,
        pinned: false,
      },
      repositoryHref: "https://github.com/michael/artifact",
    });
    expect(project.artifact.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(independentPublicLeakScan(project.artifact)).toEqual([]);
    expect(result.candidate.manifest.artifactProvenance).toContainEqual(expect.objectContaining({
      repositoryId: "repository:artifact",
      kind: "typeset-repository",
      evidenceIds: expect.arrayContaining([
        expect.stringMatching(/^evidence:/),
      ]),
    }));
    expect(JSON.stringify(project.artifact)).not.toContain("repository:artifact");
  });

  it("uses verified screenshots first, then evidence diagrams, and records fallback warnings", async () => {
    const input = makeCompositionInput({
      projectTarget: 1,
      repositories: [repositoryProfile("artifacts", { relevance: 10 })],
    });
    const repository = input.github.repositories[0]!;
    repository.homepageUrl = "https://demo.example.com/artifacts";
    input.profiles[0]!.verifiedScreenshot = {
      repositoryUrl: repository.url,
      demonstrationUrl: repository.homepageUrl,
      publicPath: "/artifacts/artifacts.png",
      alt: "Verified project interface",
      contentHash: `sha256:${"d".repeat(64)}`,
      checkedAt: input.runAt,
      status: "reachable",
      repositoryIdentityConfirmed: true,
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    };

    const screenshot = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });
    expect(screenshot.status).toBe("accepted");
    if (screenshot.status !== "accepted") return;
    expect(screenshot.candidate.publicProjection.sections[3].entries[0]?.artifact.kind).toBe("verified-deployment-screenshot");
    expect(screenshot.candidate.manifest.artifactWarnings).toEqual([]);

    input.profiles[0]!.verifiedScreenshot = {
      ...input.profiles[0]!.verifiedScreenshot,
      demonstrationUrl: "http://untrusted.example.com",
    };
    input.profiles[0]!.evidenceDiagram = {
      publicPath: "/artifacts/artifacts.svg",
      alt: "Repository-supported workflow diagram",
      contentHash: `sha256:${"e".repeat(64)}`,
      evidencePaths: [`repositories.${repository.id}.documents.0.renderedContent`],
      status: "generated",
    };

    const diagram = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });
    expect(diagram.status).toBe("accepted");
    if (diagram.status !== "accepted") return;
    expect(diagram.candidate.publicProjection.sections[3].entries[0]?.artifact.kind).toBe("evidence-derived-diagram");
    expect(diagram.candidate.manifest.artifactWarnings).toContain(`screenshot-fallback:${repository.id}`);
    expect(diagram.candidate.manifest.artifactProvenance[0]?.fieldPaths).toContain(
      `repositories.${repository.id}.documents.0.renderedContent`,
    );
    expect(createTypesetArtifactFromRepository(repository).kind).toBe("typeset-repository");
  });

  it("derives a material repository conflict from snapshots and records source normalizations", async () => {
    const normalizedInput = makeCompositionInput();
    normalizedInput.career.person.location = {
      original: "San  Diego, California",
      normalized: "San Diego, California",
      transformation: "whitespace",
      sourceOrder: 1,
      sourceLocation: "line:2",
    };
    const normalized = await composeCandidate({ ...normalizedInput, generator: new DeterministicLocalGenerator() });
    expect(normalized.status).toBe("accepted");
    if (normalized.status === "accepted") {
      expect(normalized.candidate.manifest.transformations).toContainEqual(expect.objectContaining({
        field: "career.person.location",
        kind: "whitespace",
      }));
    }

    const conflictInput = makeCompositionInput({ matching: true });
    conflictInput.career.projects.find(({ id }) => id === "project:voice")!.sourceLinks.push({
      original: "https://github.com/michael/not-voice-agent",
      sourceOrder: 9,
      sourceLocation: "line:99",
    });
    await expect(composeCandidate({ ...conflictInput, generator: new DeterministicLocalGenerator() })).resolves.toMatchObject({
      status: "rejected",
      code: "material-source-conflict",
    });
  });

  it("keeps a non-corroborating alias observable and unscored without rejecting the candidate", async () => {
    const input = makeCompositionInput({ matching: true });
    const profile = input.profiles.find(({ repositoryId }) => repositoryId === "repository:voice-agent")!;
    profile.aliasMatches[0]!.corroboratingFacts = [
      { careerPath: "projects.project:voice.technologies.0", githubPath: "repositories.repository:voice-agent.topics.0" },
      { careerPath: "projects.project:voice.bullets.0", githubPath: "repositories.repository:voice-agent.description" },
    ];
    const result = await composeCandidate({ ...input, generator: new DeterministicLocalGenerator() });
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.candidate.selectionState.evaluations.find(({ repositoryId }) => repositoryId === "repository:voice-agent")).toMatchObject({
        match: { kind: "none" },
        score: { resumeMatch: 0 },
      });
    }
  });
});
