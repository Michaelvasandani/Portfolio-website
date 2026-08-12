import { z } from "zod";

const publicContactSchema = z.object({ kind: z.enum(["email", "github", "linkedin"]), label: z.string(), href: z.string() }).strict();
const publicExperienceSchema = z.object({ organization: z.string(), title: z.string(), location: z.string().optional(), dates: z.string(), bullets: z.array(z.string()) }).strict();
const publicEducationSchema = z.object({ institution: z.string(), degree: z.string(), location: z.string().optional(), dates: z.string(), gpa: z.string().optional(), coursework: z.array(z.string()), details: z.array(z.string()) }).strict();
const publicCareerProjectSchema = z.object({ name: z.string(), technologies: z.array(z.string()), repositoryHref: z.string().optional(), bullets: z.array(z.string()) }).strict();
const publicPortfolioProjectSchema = z.object({ name: z.string(), technologies: z.array(z.string()), description: z.string(), repositoryHref: z.string(), demonstrationHref: z.string().optional(), bullets: z.array(z.string()) }).strict();
const publicOptionalSectionSchema = z.object({ kind: z.string(), heading: z.string(), items: z.array(z.string()) }).strict();
const publicSkillsSchema = z.object({ name: z.string(), items: z.array(z.string()) }).strict();
const publicResumeInputSchema = z.object({ name: z.string(), location: z.string().optional(), contacts: z.array(publicContactSchema), experience: z.array(publicExperienceSchema), education: z.array(publicEducationSchema), projects: z.array(publicCareerProjectSchema), skills: z.array(publicSkillsSchema), optionalSections: z.array(publicOptionalSectionSchema) }).strict();

export const publicProjectionSchema = z.object({
  schemaVersion: z.literal(1), metadata: z.object({ title: z.string(), description: z.string() }).strict(),
  sections: z.tuple([
    z.object({ kind: z.literal("card"), name: z.string(), location: z.string().optional(), kicker: z.string(), role: z.string(), proof: z.string(), contacts: z.array(publicContactSchema) }).strict(),
    z.object({ kind: z.literal("about"), lede: z.string(), body: z.string() }).strict(),
    z.object({ kind: z.literal("experience"), entries: z.array(publicExperienceSchema) }).strict(),
    z.object({ kind: z.literal("projects"), entries: z.array(publicPortfolioProjectSchema) }).strict(),
    z.object({ kind: z.literal("resume"), education: z.array(publicEducationSchema), skills: z.array(publicSkillsSchema), optionalSections: z.array(publicOptionalSectionSchema), htmlPath: z.string(), pdfPath: z.string() }).strict(),
    z.object({ kind: z.literal("links"), contacts: z.array(publicContactSchema) }).strict(),
  ]),
  resume: z.object({ html: publicResumeInputSchema, pdf: publicResumeInputSchema }).strict(), lastUpdated: z.iso.datetime({ offset: true }), manifestHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

export type PublicContact = z.infer<typeof publicContactSchema>;

export type PublicExperience = z.infer<typeof publicExperienceSchema>;
export type PublicEducation = z.infer<typeof publicEducationSchema>;
export type PublicCareerProject = z.infer<typeof publicCareerProjectSchema>;
export type PublicPortfolioProject = z.infer<typeof publicPortfolioProjectSchema>;
export type PublicResumeInput = z.infer<typeof publicResumeInputSchema>;

export type PublicProjection = z.infer<typeof publicProjectionSchema> & { manifestHash: `sha256:${string}` };

const forbiddenKeys = /(?:snapshot|evidence|provenance|sourceDocument|diagnostic|private|rawUpload|selectionState|generatorOutput)/i;
const forbiddenValues = [
  /(?:postgres(?:ql)?|neon|vercel-blob|private-blob):\/\//i,
  /\b(?:sk|ghp|github_pat|vercel)_[A-Za-z0-9_-]{12,}\b/,
  /\b(?:career|github|selection|evidence|candidate):[a-f0-9-]{8,}\b/i,
  /\b\d{1,5}\s+[A-Za-z0-9.' -]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd)\b/i,
  /\+?1?[ .-]?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/,
];

export function walkPublicLeaves(
  value: unknown,
  visit: (value: string | number | boolean | null, path: string) => void,
  path = "",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkPublicLeaves(entry, visit, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => walkPublicLeaves(entry, visit, path ? `${path}.${key}` : key));
    return;
  }
  visit(value as string | number | boolean | null, path);
}

export function independentPublicLeakScan(value: unknown): string[] {
  const findings: string[] = [];
  walkPublicLeaves(value, (item, path) => {
    const key = path.split(/[.[\]]/).filter(Boolean).at(-1) ?? "";
    if (key !== "manifestHash" && forbiddenKeys.test(key)) findings.push(`${path}:private-key`);
    if (typeof item === "string" && forbiddenValues.some((pattern) => pattern.test(item))) {
      findings.push(`${path}:private-value`);
    }
  });
  return findings;
}
