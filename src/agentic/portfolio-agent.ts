import { z } from "zod";

import { canonicalJson, sha256 } from "../github/canonical";
import {
  validateRendererFixture,
  type PortfolioProject,
  type RendererFixture,
} from "../renderer/fixtures";

const boundedWords = (minimum: number, maximum: number) => z.string().trim().refine((value) => {
  const words = value.split(/\s+/).filter(Boolean).length;
  return words >= minimum && words <= maximum;
}, `must contain ${minimum}-${maximum} words`);

export const repositoryEvidenceSchema = z.object({
  fullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  name: z.string().min(1),
  url: z.url().startsWith("https://github.com/"),
  description: z.string().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  updatedAt: z.iso.datetime({ offset: true }),
  fork: z.boolean(),
  archived: z.boolean(),
}).strict();

export type RepositoryEvidence = z.infer<typeof repositoryEvidenceSchema>;

export const agentDraftSchema = z.object({
  cardProof: boundedWords(15, 25),
  aboutLede: boundedWords(8, 30),
  aboutBody: boundedWords(12, 60),
  projects: z.array(z.object({
    repositoryFullName: z.string(),
    description: boundedWords(12, 30),
  }).strict()).min(3).max(5),
}).strict().superRefine((draft, context) => {
  if (new Set(draft.projects.map(({ repositoryFullName }) => repositoryFullName.toLocaleLowerCase())).size !== draft.projects.length) {
    context.addIssue({ code: "custom", path: ["projects"], message: "repositories must be unique" });
  }
  const aboutWords = `${draft.aboutLede} ${draft.aboutBody}`.split(/\s+/).filter(Boolean).length;
  if (aboutWords > 100) context.addIssue({ code: "custom", path: ["aboutBody"], message: "about copy exceeds 100 words" });
});

export type AgentDraft = z.infer<typeof agentDraftSchema>;

type BuildInput = {
  base: RendererFixture;
  repositories: readonly RepositoryEvidence[];
  draft: AgentDraft;
  publishedAt: string;
};

function projectFromEvidence(
  base: RendererFixture,
  evidence: RepositoryEvidence,
  description: string,
): PortfolioProject {
  const careerProject = base.careerProjects.find(({ repositoryHref }) =>
    repositoryHref?.replace(/\/$/, "").toLocaleLowerCase() === evidence.url.replace(/\/$/, "").toLocaleLowerCase());
  const technologies = [evidence.language, ...evidence.topics]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.findIndex((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index)
    .slice(0, 6);

  return {
    name: evidence.name,
    technologies: technologies.length ? technologies : ["Software"],
    repositoryHref: evidence.url,
    description,
    bullets: careerProject?.bullets ?? [],
  };
}

export function buildPublishedPortfolio(input: BuildInput): RendererFixture {
  const repositories = z.array(repositoryEvidenceSchema).parse(input.repositories);
  const draft = agentDraftSchema.parse(input.draft);
  const { manifestHash: _baseManifestHash, ...base } = input.base;
  void _baseManifestHash;
  const byFullName = new Map(repositories.map((repository) => [repository.fullName.toLocaleLowerCase(), repository]));
  const projects = draft.projects.map((project) => {
    const evidence = byFullName.get(project.repositoryFullName.toLocaleLowerCase());
    if (!evidence) throw new Error(`uncollected-repository:${project.repositoryFullName}`);
    return projectFromEvidence(input.base, evidence, project.description);
  });
  const unhashed = {
    ...base,
    fixture: "typical" as const,
    cardProof: draft.cardProof,
    aboutLede: draft.aboutLede,
    aboutBody: draft.aboutBody,
    projects,
    lastUpdated: z.iso.datetime({ offset: true }).parse(input.publishedAt),
  };
  const fixture: RendererFixture = {
    ...unhashed,
    manifestHash: sha256(canonicalJson(unhashed)),
  };
  const validation = validateRendererFixture(fixture);
  if (!validation.valid) throw new Error(`public-fixture-invalid:${validation.errors.join("|")}`);
  return fixture;
}

type AgentDependencies = {
  collect(): Promise<readonly RepositoryEvidence[]>;
  generate(repositories: readonly RepositoryEvidence[]): Promise<AgentDraft>;
  publish(fixture: RendererFixture, evidence: readonly RepositoryEvidence[]): Promise<void>;
  base: RendererFixture;
  now?: () => Date;
};

export async function runPortfolioAgent(dependencies: AgentDependencies) {
  const repositories = await dependencies.collect();
  const draft = await dependencies.generate(repositories);
  const fixture = buildPublishedPortfolio({
    base: dependencies.base,
    repositories,
    draft,
    publishedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
  });
  await dependencies.publish(fixture, repositories);
  return { status: "published" as const, manifestHash: fixture.manifestHash, projectCount: fixture.projects.length };
}
