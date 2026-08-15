import { z } from "zod";

import { canonicalJson, sha256 } from "../github/canonical";
import {
  createTypesetRepositoryArtifact,
  prominenceByRepositoryId,
  typesetRepositoryArtifactSchema,
} from "../composition/project-presentation";
import type {
  Contact,
  Education,
  Experience,
  PortfolioProject,
  RendererFixture,
} from "../renderer/fixtures";
import { repositoryEvidenceSchema, type RepositoryEvidence } from "./portfolio-agent";

const publicUrl = z.url().refine((value) => value.startsWith("https://"), "public links must use HTTPS");
const publicPath = z.string().startsWith("/");

const cardProjectionSchema = z.object({
  location: z.string().optional(),
  yearLabel: z.string().min(1),
  statusLines: z.tuple([z.string().min(1), z.string().min(1)]),
  kicker: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  proof: z.string().min(1),
  contacts: z.array(z.object({
    kind: z.enum(["email", "github", "linkedin"]),
    label: z.string().min(1),
    href: z.union([z.string().startsWith("mailto:"), publicUrl]),
  }).strict()).min(1),
}).strict();

const aboutEducationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  graduationDate: z.string().min(1),
  gpa: z.string().optional(),
  courses: z.array(z.string().min(1)),
}).strict();

const experienceEvidenceCalloutSchema = z.object({
  kind: z.enum(["situation", "shipped-system", "production-impact", "evidence"]).optional(),
  label: z.string().min(1),
  value: z.string().min(1),
}).strict();

const dossierExperienceSchema = z.object({
  id: z.string().regex(/^role-[a-f0-9]{16}$/),
  organization: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  dates: z.string().min(1),
  narrative: z.string().min(1),
  summary: z.string().min(1),
  evidenceCallouts: z.array(experienceEvidenceCalloutSchema),
}).strict();

const screenshotArtifactSchema = z.object({
  kind: z.literal("verified-deployment-screenshot"),
  alt: z.string().min(1),
  source: z.literal("verified-deployment"),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  src: publicPath,
}).strict();

const diagramArtifactSchema = z.object({
  kind: z.literal("evidence-derived-diagram"),
  alt: z.string().min(1),
  source: z.literal("repository-evidence"),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  src: publicPath,
}).strict();

export const evidenceArtifactSchema = z.discriminatedUnion("kind", [
  typesetRepositoryArtifactSchema,
  screenshotArtifactSchema,
  diagramArtifactSchema,
]);

const dossierProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  technologies: z.array(z.string()),
  repositoryHref: publicUrl,
  demonstrationHref: publicUrl.optional(),
  bullets: z.array(z.string()),
  prominence: z.enum(["wide", "compact"]),
  artifact: evidenceArtifactSchema,
}).strict();

const capabilityGroupSchema = z.object({
  name: z.string().min(1),
  tools: z.array(z.string().min(1)),
}).strict();

const contactSchema = z.object({
  kind: z.enum(["email", "github", "linkedin"]),
  label: z.string().min(1),
  href: z.union([z.string().startsWith("mailto:"), publicUrl]),
}).strict();

const statusStripSchema = z.object({
  state: z.enum(["verified", "stale-but-valid", "unavailable"]),
  lastUpdated: z.iso.datetime({ offset: true }),
  resumeSource: z.enum(["approved", "stale", "unavailable"]),
  githubSource: z.enum(["fresh", "stale", "unavailable"]),
  publicationChecks: z.enum(["passed", "unavailable"]),
  publicManifestHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  stages: z.tuple([
    z.literal("Approved sources"),
    z.literal("Evidence processing"),
    z.literal("Publication checks"),
    z.literal("Validated deployment"),
  ]),
}).strict();

export const dossierProjectionInputSchema = z.object({
  schemaVersion: z.literal(2),
  card: cardProjectionSchema,
  about: z.object({
    lede: z.string().min(1),
    body: z.string().min(1),
    education: z.array(aboutEducationSchema),
  }).strict(),
  experience: z.array(dossierExperienceSchema).min(1),
  projects: z.array(dossierProjectSchema).min(1),
  capabilities: z.array(capabilityGroupSchema),
  contact: z.object({
    prompt: z.string().min(1),
    contacts: z.array(contactSchema).min(1),
    resumeHtmlPath: publicPath,
    resumePdfPath: publicPath.regex(/\.pdf$/),
  }).strict(),
  statusStrip: statusStripSchema.omit({ publicManifestHash: true }),
}).strict();

export const dossierProjectionSchema = dossierProjectionInputSchema.extend({
  publicOutputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  statusStrip: statusStripSchema,
}).strict();

export const dossierPublicationEnvelopeSchema = z.object({
  kind: z.literal("agentic-portfolio-publication-v2"),
  projection: dossierProjectionSchema,
  repositoryEvidence: z.array(repositoryEvidenceSchema),
}).strict();

export const publicProjectionV2Schema = dossierProjectionSchema;
export const publicationEnvelopeV2Schema = dossierPublicationEnvelopeSchema;

export type DossierProjectionInput = z.infer<typeof dossierProjectionInputSchema>;
export type DossierProjection = z.infer<typeof dossierProjectionSchema>;
export type PublicProjectionV2 = DossierProjection;
export type EvidenceArtifact = z.infer<typeof evidenceArtifactSchema>;
export type DossierPublicationEnvelope = z.infer<typeof dossierPublicationEnvelopeSchema> & {
  repositoryEvidence: RepositoryEvidence[];
};

function unsignedProjection(projection: DossierProjectionInput | DossierProjection): DossierProjectionInput {
  const { publicOutputHash: _publicOutputHash, ...withoutOutputHash } = projection as DossierProjection;
  const { publicManifestHash: _publicManifestHash, ...withoutManifestHash } = withoutOutputHash.statusStrip;
  void _publicOutputHash;
  void _publicManifestHash;
  return {
    ...withoutOutputHash,
    statusStrip: withoutManifestHash,
  };
}

export function createDossierProjection(input: DossierProjectionInput): DossierProjection {
  const unsigned = dossierProjectionInputSchema.parse(input);
  const publicOutputHash = sha256(canonicalJson(unsigned));
  return dossierProjectionSchema.parse({
    ...unsigned,
    publicOutputHash,
    statusStrip: { ...unsigned.statusStrip, publicManifestHash: publicOutputHash },
  });
}

export function validateDossierProjection(value: unknown): DossierProjection | null {
  const parsed = dossierProjectionSchema.safeParse(value);
  if (!parsed.success) return null;
  const unsigned = unsignedProjection(parsed.data);
  if (sha256(canonicalJson(unsigned)) !== parsed.data.publicOutputHash) return null;
  if (parsed.data.statusStrip.publicManifestHash !== parsed.data.publicOutputHash) return null;
  return parsed.data;
}

function display(value: string): string {
  return value.trim();
}

function roleId(role: Experience, duplicateOrdinal: number): `role-${string}` {
  const identity = canonicalJson({
    organization: role.organization,
    title: role.title,
    location: role.location ?? null,
    dates: role.dates,
  });
  return `role-${sha256(`${identity}:${duplicateOrdinal}`).slice(7, 23)}`;
}

function cardFromFixture(base: RendererFixture): DossierProjectionInput["card"] {
  return {
    location: base.location,
    yearLabel: "Portfolio · 2026",
    statusLines: ["AI systems", "Software engineering"],
    kicker: "Engineer of dependable agentic systems",
    name: base.name,
    role: base.role,
    proof: base.cardProof,
    contacts: [...base.contacts],
  };
}

const relevantCoursePatterns = [
  "algorithm",
  "object-oriented",
  "machine learning",
  "ml/ai",
  "data structure",
  "database",
  "software engineering",
  "operating system",
  "data visualization",
] as const;

function coursePriority(course: string): number {
  const normalized = course.trim().toLowerCase();
  return relevantCoursePatterns.findIndex((pattern) => normalized.includes(pattern));
}

function selectRelevantCourses(courses: readonly string[]): string[] {
  return courses
    .map((course, sourceIndex) => ({ course, sourceIndex, priority: coursePriority(course) }))
    .filter(({ priority }) => priority >= 0)
    .sort((left, right) => left.priority - right.priority || left.sourceIndex - right.sourceIndex)
    .slice(0, 4)
    .map(({ course }) => course);
}

function educationFromFixture(base: RendererFixture): DossierProjectionInput["about"]["education"] {
  return base.education.map((education: Education) => ({
    institution: education.institution,
    degree: education.degree,
    graduationDate: education.dates,
    gpa: education.gpa,
    courses: selectRelevantCourses(education.coursework ?? []),
  }));
}

function experienceFromFixture(base: RendererFixture): DossierProjectionInput["experience"] {
  const duplicateOrdinals = new Map<string, number>();
  return base.experience.map((role: Experience) => {
    const bullets = role.bullets.map(display);
    const identity = canonicalJson({
      organization: role.organization,
      title: role.title,
      location: role.location ?? null,
      dates: role.dates,
    });
    const duplicateOrdinal = duplicateOrdinals.get(identity) ?? 0;
    duplicateOrdinals.set(identity, duplicateOrdinal + 1);
    const clauses = bullets.length
      ? bullets.map((bullet) => `I ${bullet.charAt(0).toLocaleLowerCase()}${bullet.slice(1)}`)
      : [`I held the ${role.title} role at ${role.organization}.`];
    return {
      id: roleId(role, duplicateOrdinal),
      organization: role.organization,
      title: role.title,
      location: role.location,
      dates: role.dates,
      narrative: clauses.join(" "),
      summary: clauses[0] ?? `${role.title} at ${role.organization}`,
      evidenceCallouts: bullets.slice(0, 4).map((value) => {
        const kind = /\d/.test(value)
          ? "production-impact" as const
          : /\b(?:built|engineer(?:ed|ing)?|architected|integrated|launched|implemented|designed|developed)\b/i.test(value)
            ? "shipped-system" as const
            : /\b(?:for|to|when|after|across|internal|users|teams)\b/i.test(value)
              ? "situation" as const
              : "evidence" as const;
        const labels = {
          situation: "Situation",
          "shipped-system": "Shipped system",
          "production-impact": "Production impact",
          evidence: "Evidence",
        } as const;
        return { kind, label: labels[kind], value };
      }),
    };
  });
}

function artifactFor(project: PortfolioProject): z.infer<typeof typesetRepositoryArtifactSchema> {
  const metadata = project.repositoryMetadata;
  return createTypesetRepositoryArtifact({
    name: project.name,
    description: metadata && metadata.description !== undefined ? metadata.description : project.description,
    language: metadata?.language ?? project.technologies[0] ?? null,
    topics: metadata?.topics ?? project.technologies.slice(1),
    lastUpdated: metadata?.lastUpdated ?? null,
    releaseCount: metadata?.releaseCount ?? 0,
    pinned: metadata?.pinned ?? false,
    url: project.repositoryHref,
  });
}

function projectsFromFixture(base: RendererFixture): DossierProjectionInput["projects"] {
  const prominence = prominenceByRepositoryId(base.projects.map((project, order) => ({
    repositoryId: project.repositoryHref,
    order,
    relevance: project.aiRelevance ?? 0,
  })));
  return base.projects.map((project: PortfolioProject) => ({
    name: project.name,
    description: project.description,
    technologies: [...project.technologies],
    repositoryHref: project.repositoryHref,
    ...(project.demonstrationHref ? { demonstrationHref: project.demonstrationHref } : {}),
    bullets: [...project.bullets],
    prominence: prominence.get(project.repositoryHref)!,
    artifact: artifactFor(project),
  }));
}

function capabilitiesFromFixture(base: RendererFixture): DossierProjectionInput["capabilities"] {
  return base.skills.map((group) => ({ name: group.name, tools: [...group.items] }));
}

function contactsFromFixture(contacts: readonly Contact[]) {
  return contacts.map(({ kind, label, href }) => ({ kind, label, href }));
}

export function buildDossierProjection(input: { base: RendererFixture; publishedAt: string }): DossierProjection {
  const lastUpdated = z.iso.datetime({ offset: true }).parse(input.publishedAt);
  return createDossierProjection({
    schemaVersion: 2,
    card: cardFromFixture(input.base),
    about: {
      lede: input.base.aboutLede,
      body: input.base.aboutBody,
      education: educationFromFixture(input.base),
    },
    experience: experienceFromFixture(input.base),
    projects: projectsFromFixture(input.base),
    capabilities: capabilitiesFromFixture(input.base),
    contact: {
      prompt: "Building production AI? Let’s talk.",
      contacts: contactsFromFixture(input.base.contacts),
      resumeHtmlPath: "/resume",
      resumePdfPath: "/michael-vasandani-resume.pdf",
    },
    statusStrip: {
      state: "verified",
      lastUpdated,
      resumeSource: "approved",
      githubSource: "fresh",
      publicationChecks: "passed",
      stages: ["Approved sources", "Evidence processing", "Publication checks", "Validated deployment"],
    },
  });
}
