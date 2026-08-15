import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildDossierProjection } from "../agentic/dossier-publication";
import { getRendererFixture, type RendererFixture } from "./fixtures";
import { Portfolio } from "./portfolio";

describe("living dossier renderer", () => {
  it("selects four relevant courses deterministically instead of taking the first four", () => {
    const base = getRendererFixture("typical");
    const fixture: RendererFixture = {
      ...base,
      education: [{
        ...base.education[0]!,
        coursework: ["Data Visualization", "Object-Oriented Programming", "Algorithms", "Databases", "ML/AI"],
      }],
    };

    const projection = buildDossierProjection({ base: fixture, publishedAt: base.lastUpdated });

    expect(projection.about.education[0]?.courses).toEqual([
      "Algorithms",
      "Object-Oriented Programming",
      "ML/AI",
      "Databases",
    ]);
  });

  it("renders the approved journey and an accessible Dossier index", () => {
    const base = getRendererFixture("typical");
    const projection = buildDossierProjection({ base, publishedAt: base.lastUpdated });
    const html = renderToStaticMarkup(createElement(Portfolio, { fixture: projection }));

    expect(html).toContain('aria-label="Dossier index"');
    expect(html).toContain('href="#about"');
    expect(html).toContain('href="#experience"');
    expect(html).toContain('href="#projects"');
    expect(html).toContain('href="#skills"');
    expect(html).toContain('href="#contact"');
    expect(html).toContain('href="/resume"');
    expect(html).toContain('aria-current="location"');
    expect(html).toContain("Skills &amp; Tools");
    expect(html).not.toContain('id="resume"');
    expect(html).not.toContain('id="links"');
  });

  it("omits optional education labels when the source has no education record", () => {
    const base = getRendererFixture("sparse");
    const projection = buildDossierProjection({ base, publishedAt: base.lastUpdated });
    const html = renderToStaticMarkup(createElement(Portfolio, { fixture: projection }));

    expect(html).toContain("About");
    expect(html).not.toContain(">Education<");
    expect(html).not.toContain("Relevant courses:");
    expect(html).not.toContain("GPA:");
  });
});
