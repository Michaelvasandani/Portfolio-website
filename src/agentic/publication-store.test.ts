import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { getRendererFixture } from "../renderer/fixtures";
import { buildDossierProjection } from "./dossier-publication";
import { buildPublishedPortfolio, type AgentDraft, type RepositoryEvidence } from "./portfolio-agent";
import { createPortfolioPublicationStore } from "./publication-store";

const databases: PGlite[] = [];
afterEach(async () => Promise.all(databases.splice(0).map((database) => database.close())));

function fixture(at: string) {
  const repositories: RepositoryEvidence[] = ["one", "two", "three"].map((name, index) => ({
    fullName: `Michaelvasandani/${name}`,
    name,
    url: `https://github.com/Michaelvasandani/${name}`,
    description: `Repository ${name}`,
    language: index % 2 ? "Python" : "TypeScript",
    topics: ["agents"],
    updatedAt: `2026-08-${String(12 - index).padStart(2, "0")}T00:00:00.000Z`,
    fork: false,
    archived: false,
  }));
  const draft: AgentDraft = {
    cardProof: "I build dependable agentic systems that convert source evidence into useful software, measurable outcomes, and safe automated decisions.",
    aboutLede: "I build practical agentic software grounded in real project and career evidence.",
    aboutBody: "My work combines reliable automation, retrieval, APIs, and product judgment to turn ambiguous problems into maintainable systems.",
    projects: repositories.map((repository) => ({
      repositoryFullName: repository.fullName,
      description: "This source-grounded project demonstrates dependable agentic software through documented workflows and practical automated systems for users.",
    })),
  };
  return {
    repositories,
    portfolio: buildPublishedPortfolio({ base: getRendererFixture("typical"), repositories, draft, publishedAt: at }),
  };
}

describe("Neon publication store contract", () => {
  it("installs its immutable table and returns the newest valid publication", async () => {
    const database = new PGlite();
    databases.push(database);
    const store = createPortfolioPublicationStore(async (text, parameters = []) =>
      (await database.query<Record<string, unknown>>(text, parameters)).rows);
    const first = fixture("2026-08-12T00:00:00.000Z");
    const second = fixture("2026-08-13T00:00:00.000Z");

    expect(await store.latest()).toBeNull();
    await store.publish(first.portfolio, first.repositories);
    await store.publish(second.portfolio, second.repositories);

    await expect(store.latest()).resolves.toEqual(second.portfolio);
    const rows = await database.query<{ count: number }>("SELECT count(*)::int AS count FROM publication_manifests");
    expect(rows.rows[0]?.count).toBe(2);
  });

  it("deduplicates retrying the exact same immutable publication", async () => {
    const database = new PGlite();
    databases.push(database);
    const store = createPortfolioPublicationStore(async (text, parameters = []) =>
      (await database.query<Record<string, unknown>>(text, parameters)).rows);
    const published = fixture("2026-08-13T00:00:00.000Z");

    await store.publish(published.portfolio, published.repositories);
    await store.publish(published.portfolio, published.repositories);

    const rows = await database.query<{ count: number }>("SELECT count(*)::int AS count FROM publication_manifests");
    expect(rows.rows[0]?.count).toBe(1);
  });

  it("round-trips a version-two dossier beside the current version", async () => {
    const database = new PGlite();
    databases.push(database);
    const store = createPortfolioPublicationStore(async (text, parameters = []) =>
      (await database.query<Record<string, unknown>>(text, parameters)).rows);
    const current = fixture("2026-08-12T00:00:00.000Z");
    const dossier = buildDossierProjection({
      base: current.portfolio,
      publishedAt: "2026-08-14T00:00:00.000Z",
    });

    await store.publish(current.portfolio, current.repositories);
    await store.publishDossier(dossier, current.repositories);

    await expect(store.latest()).resolves.toEqual(dossier);
    const versions = await database.query<{ schema_version: number }>(
      "SELECT schema_version FROM publication_manifests ORDER BY created_at",
    );
    expect(versions.rows.map(({ schema_version }) => schema_version)).toEqual([1, 2]);
  });

  it("skips invalid newer envelopes and keeps the last valid publication serveable", async () => {
    const database = new PGlite();
    databases.push(database);
    const store = createPortfolioPublicationStore(async (text, parameters = []) =>
      (await database.query<Record<string, unknown>>(text, parameters)).rows);
    const current = fixture("2026-08-12T00:00:00.000Z");
    const dossier = buildDossierProjection({
      base: current.portfolio,
      publishedAt: "2026-08-14T00:00:00.000Z",
    });

    await store.publish(current.portfolio, current.repositories);
    await database.query(
      `INSERT INTO publication_manifests (id, schema_version, content_hash, payload, created_at)
       VALUES ($1, 1, $2, $3::jsonb, $4::timestamptz)`,
      [
        "publication:unknown-version",
        `sha256:${"a".repeat(64)}`,
        JSON.stringify({ kind: "agentic-portfolio-publication-v99" }),
        "2026-08-15T00:00:00.000Z",
      ],
    );
    await database.query(
      `INSERT INTO publication_manifests (id, schema_version, content_hash, payload, created_at)
       VALUES ($1, 1, $2, $3::jsonb, $4::timestamptz)`,
      [
        "publication:invalid-hash",
        `sha256:${"b".repeat(64)}`,
        JSON.stringify({
          kind: "agentic-portfolio-publication-v1",
          fixture: { ...current.portfolio, manifestHash: `sha256:${"c".repeat(64)}` },
          repositoryEvidence: current.repositories,
        }),
        "2026-08-16T00:00:00.000Z",
      ],
    );
    await database.query(
      `INSERT INTO publication_manifests (id, schema_version, content_hash, payload, created_at)
       VALUES ($1, 1, $2, $3::jsonb, $4::timestamptz)`,
      [
        "publication:incomplete-dossier",
        `sha256:${"d".repeat(64)}`,
        JSON.stringify({
          kind: "agentic-portfolio-publication-v2",
          projection: { ...dossier, projects: [] },
          repositoryEvidence: current.repositories,
        }),
        "2026-08-17T00:00:00.000Z",
      ],
    );
    await database.query(
      `INSERT INTO publication_manifests (id, schema_version, content_hash, payload, created_at)
       VALUES ($1, 1, $2, $3::jsonb, $4::timestamptz)`,
      [
        "publication:invalid-dossier-hash",
        `sha256:${"f".repeat(64)}`,
        JSON.stringify({
          kind: "agentic-portfolio-publication-v2",
          projection: {
            ...dossier,
            publicOutputHash: `sha256:${"f".repeat(64)}`,
            statusStrip: { ...dossier.statusStrip, publicManifestHash: `sha256:${"f".repeat(64)}` },
          },
          repositoryEvidence: current.repositories,
        }),
        "2026-08-18T00:00:00.000Z",
      ],
    );
    await database.query(
      `INSERT INTO publication_manifests (id, schema_version, content_hash, payload, created_at)
       VALUES ($1, 1, $2, $3::jsonb, $4::timestamptz)`,
      [
        "publication:malformed-envelope",
        `sha256:${"e".repeat(64)}`,
        JSON.stringify({ kind: "agentic-portfolio-publication-v2", projection: dossier }),
        "2026-08-19T00:00:00.000Z",
      ],
    );

    await expect(store.latest()).resolves.toEqual(current.portfolio);
  });
});
