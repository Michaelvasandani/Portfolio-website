import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildDossierProjection } from "../agentic/dossier-publication";
import { getRendererFixture } from "./fixtures";
import { Portfolio } from "./portfolio";

describe("versioned portfolio rendering", () => {
  it("renders a dossier projection through the ordinary Portfolio path while retaining the Card view", () => {
    const base = getRendererFixture("typical");
    const projection = buildDossierProjection({ base, publishedAt: "2026-08-14T00:00:00.000Z" });
    const html = renderToStaticMarkup(createElement(Portfolio, { fixture: projection }));

    expect(html).toContain('class="card-view"');
    expect(html).toContain(base.name);
    expect(html).toContain(base.cardProof);
    expect(html).toContain('href="#about"');
    expect(html).toContain("About");
    expect(html).toContain("Experience");
    expect(html).toContain("Projects");
    expect(html).toContain("Skills &amp; Tools");
    expect(html).toContain("Contact");
    expect(html).toContain('aria-label="Dossier index"');
    expect(html).toContain("Building production AI? Let’s talk.");
    expect(html).toContain("Portfolio verified by its agent");
  });
});
