import { describe, expect, it } from "vitest";

import { getRendererFixture } from "../renderer/fixtures";
import {
  buildDossierProjection,
  dossierProjectionSchema,
  type DossierProjection,
} from "./dossier-publication";

describe("dossier publication projection", () => {
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
});
