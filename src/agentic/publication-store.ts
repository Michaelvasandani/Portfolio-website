import { z } from "zod";

import { canonicalJson, sha256 } from "../github/canonical";
import { fixtureNames, validateRendererFixture, type RendererFixture } from "../renderer/fixtures";
import {
  dossierPublicationEnvelopeSchema,
  validateDossierProjection,
  type DossierProjection,
} from "./dossier-publication";
import { repositoryEvidenceSchema, type RepositoryEvidence } from "./portfolio-agent";

type Query = (text: string, parameters?: unknown[]) => Promise<Record<string, unknown>[]>;

const contactSchema = z.object({
  kind: z.enum(["email", "github", "linkedin"]),
  label: z.string(),
  href: z.string(),
}).strict();
const experienceSchema = z.object({
  organization: z.string(),
  title: z.string(),
  location: z.string().optional(),
  dates: z.string(),
  bullets: z.array(z.string()),
}).strict();
const educationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  location: z.string().optional(),
  dates: z.string(),
  gpa: z.string().optional(),
  coursework: z.array(z.string()).optional(),
  details: z.array(z.string()).optional(),
}).strict();
const careerProjectSchema = z.object({
  name: z.string(),
  technologies: z.array(z.string()),
  repositoryHref: z.string().optional(),
  bullets: z.array(z.string()),
}).strict();
const portfolioProjectSchema = careerProjectSchema.extend({
  description: z.string(),
  repositoryHref: z.string(),
}).strict();
const rendererFixtureSchema = z.object({
  fixture: z.enum(fixtureNames),
  name: z.string(),
  location: z.string().optional(),
  role: z.string(),
  cardProof: z.string(),
  aboutLede: z.string(),
  aboutBody: z.string(),
  contacts: z.array(contactSchema),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  careerProjects: z.array(careerProjectSchema),
  projects: z.array(portfolioProjectSchema),
  skills: z.array(z.object({ name: z.string(), items: z.array(z.string()) }).strict()),
  optionalSections: z.array(z.object({
    heading: z.enum(["Awards", "Certifications", "Publications", "Volunteering"]),
    items: z.array(z.string()),
  }).strict()),
  lastUpdated: z.iso.datetime({ offset: true }),
  manifestHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

const publicationEnvelopeSchema = z.object({
  kind: z.literal("agentic-portfolio-publication-v1"),
  fixture: rendererFixtureSchema,
  repositoryEvidence: z.array(repositoryEvidenceSchema),
}).strict();

export { dossierPublicationEnvelopeSchema } from "./dossier-publication";

export type PublishedPortfolio = RendererFixture | DossierProjection;

function validFixture(value: unknown): RendererFixture | null {
  const parsed = rendererFixtureSchema.safeParse(value);
  if (!parsed.success) return null;
  const { manifestHash, ...unhashed } = parsed.data;
  if (sha256(canonicalJson(unhashed)) !== manifestHash) return null;
  const fixture = parsed.data as RendererFixture;
  return validateRendererFixture(fixture).valid ? fixture : null;
}

function validDossier(value: unknown): DossierProjection | null {
  const parsed = dossierPublicationEnvelopeSchema.safeParse(value);
  if (!parsed.success) return null;
  return validateDossierProjection(parsed.data.projection);
}

function validPublication(value: unknown): PublishedPortfolio | null {
  const legacy = publicationEnvelopeSchema.safeParse(value);
  if (legacy.success) return validFixture(legacy.data.fixture);
  return validDossier(value);
}

export function createPortfolioPublicationStore(query: Query) {
  let installed: Promise<void> | undefined;
  const ensureInstalled = () => installed ??= query(`
    CREATE TABLE IF NOT EXISTS publication_manifests (
      id text PRIMARY KEY,
      schema_version integer NOT NULL CHECK (schema_version = 1),
      content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL
    )
  `).then(() => undefined);

  return {
    async publish(fixture: RendererFixture, repositoryEvidence: readonly RepositoryEvidence[]): Promise<void> {
      await ensureInstalled();
      const validatedFixture = validFixture(fixture);
      if (!validatedFixture) throw new Error("publication-fixture-invalid");
      const envelope = publicationEnvelopeSchema.parse({
        kind: "agentic-portfolio-publication-v1",
        fixture: validatedFixture,
        repositoryEvidence,
      });
      await query(
        `INSERT INTO publication_manifests (id, schema_version, content_hash, payload, created_at)
         VALUES ($1, 1, $2, $3::jsonb, $4::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [`publication:${fixture.manifestHash.slice(7)}`, fixture.manifestHash, JSON.stringify(envelope), fixture.lastUpdated],
      );
    },

    async publishDossier(projection: DossierProjection, repositoryEvidence: readonly RepositoryEvidence[]): Promise<void> {
      await ensureInstalled();
      const validatedProjection = validateDossierProjection(projection);
      if (!validatedProjection) throw new Error("publication-dossier-invalid");
      const envelope = dossierPublicationEnvelopeSchema.parse({
        kind: "agentic-portfolio-publication-v2",
        projection: validatedProjection,
        repositoryEvidence,
      });
      await query(
        `INSERT INTO publication_manifests (id, schema_version, content_hash, payload, created_at)
         VALUES ($1, 1, $2, $3::jsonb, $4::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        [
          `publication:${validatedProjection.publicOutputHash.slice(7)}`,
          validatedProjection.publicOutputHash,
          JSON.stringify(envelope),
          validatedProjection.statusStrip.lastUpdated,
        ],
      );
    },

    async latest(): Promise<PublishedPortfolio | null> {
      await ensureInstalled();
      const rows = await query(
        `SELECT payload
         FROM publication_manifests
         ORDER BY created_at DESC, id DESC
         `,
      );
      for (const row of rows) {
        const publication = validPublication(row.payload);
        if (publication) return publication;
      }
      return null;
    },
  };
}

export type PortfolioPublicationStore = ReturnType<typeof createPortfolioPublicationStore>;
