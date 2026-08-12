import { describe, expect, it } from "vitest";

import {
  fixtureNames,
  getRendererFixture,
  validateRendererFixture,
} from "./fixtures";

describe("Approved renderer fixture baselines", () => {
  it("defines the sparse, typical, dense, long-word, optional-section, and six-pin baselines", () => {
    expect(fixtureNames).toEqual([
      "sparse",
      "typical",
      "dense",
      "long-word",
      "optional-section",
      "six-pin",
    ]);
  });

  it.each(fixtureNames)("%s preserves complete content and bounded narrative copy", (name) => {
    const fixture = getRendererFixture(name);
    const result = validateRendererFixture(fixture);

    expect(result).toEqual({ valid: true, errors: [] });
    const proofWords = fixture.cardProof.trim().split(/\s+/).length;
    expect(proofWords).toBeGreaterThanOrEqual(15);
    expect(proofWords).toBeLessThanOrEqual(25);
    expect(`${fixture.aboutLede} ${fixture.aboutBody}`.trim().split(/\s+/).length).toBeLessThanOrEqual(100);

    for (const project of fixture.projects) {
      const words = project.description.trim().split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(12);
      expect(words).toBeLessThanOrEqual(30);
    }
  });

  it("keeps the dense résumé content in source order without truncation", () => {
    const dense = getRendererFixture("dense");

    expect(dense.experience).toHaveLength(6);
    expect(dense.projects).toHaveLength(6);
    expect(dense.optionalSections.map(({ heading }) => heading)).toEqual([
      "Awards",
      "Certifications",
      "Publications",
      "Volunteering",
    ]);
    expect(dense.experience.flatMap(({ bullets }) => bullets)).toContain(
      "Designed a deterministic publication verifier that compares every rendered field against immutable evidence before promotion.",
    );
  });

  it("uses LinkedIn only as an outbound allowlisted contact", () => {
    const typical = getRendererFixture("typical");
    const linkedIn = typical.contacts.find(({ kind }) => kind === "linkedin");

    expect(linkedIn).toEqual({
      kind: "linkedin",
      label: "LinkedIn profile",
      href: "https://linkedin.com/in/michael-vasandani",
    });
  });
});
