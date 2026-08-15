import { describe, expect, it } from "vitest";

import { getRendererFixture } from "../renderer/fixtures";
import {
  buildDossierProjection,
  dossierProjectionSchema,
  type PublicationStatusInput,
  type DossierProjection,
} from "./dossier-publication";

function buildProjectionWithStatus(overrides: PublicationStatusInput) {
  return buildDossierProjection({
    base: getRendererFixture("typical"),
    publishedAt: "2026-08-14T00:00:00.000Z",
    publicationStatus: overrides,
  });
}

describe("dossier publication projection", () => {
  it("projects supported source skills into one ordered best-fit capability group", () => {
    const base = getRendererFixture("typical");
    const projection = buildDossierProjection({ base, publishedAt: "2026-08-14T00:00:00.000Z" });

    expect(projection.capabilities).toEqual([
      {
        name: "AI Systems",
        tools: ["LangGraph", "Ollama", "LangChain", "Hugging Face Transformers"],
      },
      {
        name: "Backend & APIs",
        tools: ["Java", "Python", "C++", "SQL", "JavaScript", "TypeScript", "Node.js", "FastAPI", "Pydantic"],
      },
      {
        name: "Data & ML",
        tools: ["R", "Pinecone", "pgvector", "pandas", "NumPy", "scikit-learn", "PyTorch", "TensorFlow"],
      },
      {
        name: "Product Interfaces",
        tools: ["HTML/CSS", "React", "Angular", "Material-UI"],
      },
      {
        name: "Infrastructure",
        tools: ["Git", "GitHub Actions", "Docker", "Kubernetes", "AWS", "GCP"],
      },
    ]);
  });

  it("preserves source spellings, removes duplicate and unsupported skills, and omits empty groups", () => {
    const base = getRendererFixture("typical");
    const projection = buildDossierProjection({
      base: {
        ...base,
        skills: [
          { name: "Source one", items: [" TypeScript ", "LangGraph", "Unsupported Tool"] },
          { name: "Source two", items: ["TypeScript", "React"] },
        ],
      },
      publishedAt: "2026-08-14T00:00:00.000Z",
    });

    expect(projection.capabilities).toEqual([
      { name: "AI Systems", tools: ["LangGraph"] },
      { name: "Backend & APIs", tools: [" TypeScript "] },
      { name: "Product Interfaces", tools: ["React"] },
    ]);
  });

  it("composes the version-two public contract without losing the Card inputs", () => {
    const projection = buildDossierProjection({
      base: getRendererFixture("typical"),
      publishedAt: "2026-08-14T00:00:00.000Z",
    });

    expect(projection.schemaVersion).toBe(2);
    expect(projection.card).toMatchObject({
      name: "Michael Sagar Vasandani",
      role: "AI Engineer & Software Builder",
      proof: getRendererFixture("typical").cardProof,
    });
    expect(projection.about.education[0]).toMatchObject({
      institution: "University of California, San Diego - San Diego, CA",
      degree: "Bachelor of Science in Data Science - GPA: 3.82",
      gpa: "3.82",
    });
    expect(projection.experience[0]).toMatchObject({
      organization: "ResMed",
      narrative: expect.any(String),
      evidenceCallouts: expect.arrayContaining([
        expect.objectContaining({ label: expect.any(String), value: expect.any(String) }),
      ]),
    });
    expect(projection.projects.slice(0, 2).map(({ prominence }) => prominence)).toEqual(["wide", "wide"]);
    expect(projection.projects.every(({ artifact }) => artifact.kind === "typeset-repository")).toBe(true);
    expect(projection.capabilities[0]).toMatchObject({ name: expect.any(String), tools: expect.any(Array) });
    expect(projection.contact.contacts).toHaveLength(3);
    expect(projection.statusStrip).toMatchObject({
      state: "verified",
      resumeSource: "approved",
      githubSource: "fresh",
      publicationChecks: "passed",
    });
    expect(dossierProjectionSchema.parse(projection)).toEqual(projection);
  });

  it("rejects an incomplete projection before publication", () => {
    const projection = buildDossierProjection({
      base: getRendererFixture("typical"),
      publishedAt: "2026-08-14T00:00:00.000Z",
    });
    const incomplete = { ...projection, projects: [] } as DossierProjection;

    expect(() => dossierProjectionSchema.parse(incomplete)).toThrow();
  });

  it("derives a stale-but-valid status without overstating the source freshness", () => {
    const projection = buildProjectionWithStatus({ githubSource: "stale" });

    expect(projection.statusStrip).toMatchObject({
      state: "stale-but-valid",
      resumeSource: "approved",
      githubSource: "stale",
      publicationChecks: "passed",
      lastUpdated: "2026-08-14T00:00:00.000Z",
    });
  });

  it("keeps the last successful update when publication status is unavailable", () => {
    const projection = buildProjectionWithStatus({ publicationChecks: "unavailable" });

    expect(projection.statusStrip).toMatchObject({
      state: "unavailable",
      publicationChecks: "unavailable",
      lastUpdated: "2026-08-12T00:00:00.000Z",
    });
  });
});
