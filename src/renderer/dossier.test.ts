import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildDossierProjection, type PublicationStatusInput } from "../agentic/dossier-publication";
import { getRendererFixture, type RendererFixture } from "./fixtures";
import { Portfolio } from "./portfolio";

function buildProjectionWithStatus(overrides: PublicationStatusInput) {
  return buildDossierProjection({
    base: getRendererFixture("typical"),
    publishedAt: "2026-08-14T00:00:00.000Z",
    publicationStatus: overrides,
  });
}

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
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain('id="role-');
    expect(html.match(/<details class="entry experience-entry"[^>]*open=""/g)).toHaveLength(projection.experience.length);
    expect(html).not.toContain('id="resume"');
    expect(html).not.toContain('id="links"');
  });

  it("renders capability-first toolkits and concise closing links with descriptive names", () => {
    const base = getRendererFixture("typical");
    const projection = buildDossierProjection({ base, publishedAt: base.lastUpdated });
    const html = renderToStaticMarkup(createElement(Portfolio, { fixture: projection }));
    const skills = html.slice(html.indexOf('id="skills"'), html.indexOf('id="contact"'));

    expect(skills).toContain('class="capability-group"');
    expect(skills).toContain('aria-labelledby="capability-ai-systems"');
    expect(skills.indexOf("AI Systems")).toBeLessThan(skills.indexOf("LangGraph"));
    expect(skills).not.toContain(">Languages<");
    expect(skills).not.toContain(">Frameworks<");
    const contact = html.slice(html.indexOf('id="contact"'), html.indexOf('aria-label="Publication status"'));
    expect(contact).toContain('class="contact-link contact-link--primary discrete-link meta"');
    expect(contact).toContain('class="contact-link contact-link--secondary discrete-link meta"');
    expect(contact).toContain('aria-label="Email Michael"');
    expect(contact).toContain('aria-label="Michael Vasandani on GitHub"');
    expect(contact).toContain('aria-label="LinkedIn profile"');
    expect(contact).toContain(">Email<");
    expect(contact).toContain(">GitHub<");
    expect(contact).toContain(">LinkedIn<");
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

  it("creates unique role anchors and first-person stories for duplicate source roles", () => {
    const base = getRendererFixture("typical");
    const duplicate = { ...base.experience[0]! };
    const projection = buildDossierProjection({ base: { ...base, experience: [duplicate, duplicate] }, publishedAt: base.lastUpdated });

    expect(new Set(projection.experience.map(({ id }) => id)).size).toBe(2);
    expect(projection.experience.every(({ narrative }) => narrative.startsWith("I "))).toBe(true);
    expect(projection.experience[0]?.summary).toContain("I ");
  });

  it("keeps role anchors stable when source order changes", () => {
    const base = getRendererFixture("typical");
    const original = buildDossierProjection({ base, publishedAt: base.lastUpdated });
    const reordered = buildDossierProjection({
      base: { ...base, experience: [...base.experience].reverse() },
      publishedAt: base.lastUpdated,
    });

    for (const role of original.experience) {
      expect(reordered.experience.find(({ organization }) => organization === role.organization)?.id).toBe(role.id);
    }
  });

  it("keeps role anchors stable when a role's evidence changes", () => {
    const base = getRendererFixture("typical");
    const original = buildDossierProjection({ base, publishedAt: base.lastUpdated });
    const changed = buildDossierProjection({
      base: {
        ...base,
        experience: base.experience.map((role, index) => index === 0
          ? { ...role, bullets: ["Updated evidence without changing the role identity."] }
          : role),
      },
      publishedAt: base.lastUpdated,
    });

    expect(changed.experience[0]?.id).toBe(original.experience[0]?.id);
  });

  it("renders truthful verified, source-stale, and unavailable publication states", () => {
    const verified = renderToStaticMarkup(createElement(Portfolio, {
      fixture: buildDossierProjection({ base: getRendererFixture("typical"), publishedAt: "2026-08-14T00:00:00.000Z" }),
    }));
    const stale = renderToStaticMarkup(createElement(Portfolio, {
      fixture: buildProjectionWithStatus({ githubSource: "stale" }),
    }));
    const unavailable = renderToStaticMarkup(createElement(Portfolio, {
      fixture: buildProjectionWithStatus({ publicationChecks: "unavailable" }),
    }));

    expect(verified).toContain('data-publication-status="verified"');
    expect(verified).toContain("Portfolio verified by its agent");
    expect(stale).toContain('data-publication-status="stale-but-valid"');
    expect(stale).toContain("Portfolio still valid; source refresh is due");
    expect(unavailable).toContain('data-publication-status="unavailable"');
    expect(unavailable).toContain("Publication status is temporarily unavailable");
    expect(unavailable).not.toContain("August 14, 2026");
    expect(unavailable).toContain("August 12, 2026");
  });

  it("explains the public pipeline in order without private operational details", () => {
    const projection = buildDossierProjection({ base: getRendererFixture("typical"), publishedAt: "2026-08-14T00:00:00.000Z" });
    const html = renderToStaticMarkup(createElement(Portfolio, { fixture: projection }));
    const status = html.slice(html.indexOf('aria-label="Publication status"'));

    expect(status).toContain("Approved sources");
    expect(status).toContain("Evidence processing");
    expect(status).toContain("Publication checks");
    expect(status).toContain("Validated deployment");
    expect(status.indexOf("Approved sources")).toBeLessThan(status.indexOf("Evidence processing"));
    expect(status.indexOf("Evidence processing")).toBeLessThan(status.indexOf("Publication checks"));
    expect(status.indexOf("Publication checks")).toBeLessThan(status.indexOf("Validated deployment"));
    expect(status).toContain("The approved résumé and public GitHub record are checked first.");
    expect(status).toContain("The public result is checked before the validated deployment is served.");
    expect(status).not.toMatch(/(?:snapshot|evidence:|prompt|diagnostic|log|credential|\/api\/control|postgresql:\/\/)/i);
  });

  it("promotes the most AI-relevant projects with stable ties and renders safe artifact fallbacks", () => {
    const base = getRendererFixture("typical");
    const projection = buildDossierProjection({
      base: {
        ...base,
        projects: [
          {
            ...base.projects[0]!,
            aiRelevance: 4,
            repositoryMetadata: {
              description: null,
              language: "TypeScript",
              topics: ["verified-topic"],
              lastUpdated: "2026-08-11T00:00:00.000Z",
              releaseCount: 2,
              pinned: false,
            },
          },
          { ...base.projects[1]!, aiRelevance: 10, demonstrationHref: "https://demo.example.com/safe-trip" },
          { ...base.projects[2]!, aiRelevance: 10 },
        ],
      },
      publishedAt: base.lastUpdated,
    });
    const html = renderToStaticMarkup(createElement(Portfolio, { fixture: projection }));

    expect(projection.projects.map(({ name, prominence }) => ({ name, prominence }))).toEqual([
      { name: "Hackathon-In-A-Box", prominence: "compact" },
      { name: "SafeTrip SF", prominence: "wide" },
      { name: "Personal Call Agent", prominence: "wide" },
    ]);
    expect(projection.projects[0]?.artifact).toMatchObject({
      kind: "typeset-repository",
      description: null,
      language: "TypeScript",
      topics: ["verified-topic"],
      metadata: { lastUpdated: "2026-08-11T00:00:00.000Z", releaseCount: 2, pinned: false },
    });
    expect(html).toContain("No public repository description supplied.");
    expect(html).toContain("Open verified SafeTrip SF demonstration");
    expect(html).toContain('data-artifact-kind="typeset-repository"');
    expect(html).not.toContain("evidence:");
  });
});
