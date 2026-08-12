export type PublicContact = {
  kind: "email" | "github" | "linkedin";
  label: string;
  href: string;
};

export type PublicExperience = {
  organization: string;
  title: string;
  location?: string;
  dates: string;
  bullets: string[];
};

export type PublicEducation = {
  institution: string;
  degree: string;
  location?: string;
  dates: string;
  gpa?: string;
  coursework: string[];
  details: string[];
};

export type PublicCareerProject = {
  name: string;
  technologies: string[];
  repositoryHref?: string;
  bullets: string[];
};

export type PublicPortfolioProject = {
  name: string;
  technologies: string[];
  description: string;
  repositoryHref: string;
  demonstrationHref?: string;
  bullets: string[];
};

export type PublicResumeInput = {
  name: string;
  location?: string;
  contacts: PublicContact[];
  experience: PublicExperience[];
  education: PublicEducation[];
  projects: PublicCareerProject[];
  skills: { name: string; items: string[] }[];
  optionalSections: { kind: string; heading: string; items: string[] }[];
};

export type PublicProjection = {
  schemaVersion: 1;
  metadata: { title: string; description: string };
  sections: [
    { kind: "card"; name: string; location?: string; kicker: string; role: string; proof: string; contacts: PublicContact[] },
    { kind: "about"; lede: string; body: string },
    { kind: "experience"; entries: PublicExperience[] },
    { kind: "projects"; entries: PublicPortfolioProject[] },
    {
      kind: "resume";
      education: PublicEducation[];
      skills: { name: string; items: string[] }[];
      optionalSections: { kind: string; heading: string; items: string[] }[];
      htmlPath: string;
      pdfPath: string;
    },
    { kind: "links"; contacts: PublicContact[] },
  ];
  resume: { html: PublicResumeInput; pdf: PublicResumeInput };
  lastUpdated: string;
  manifestHash: `sha256:${string}`;
};

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
