import { canonicalJson, sha256 } from "../github/canonical";
import type { CareerSnapshot } from "../ingestion/service";
import type { GitHubSnapshot } from "../github/snapshot-contract";
import type {
  CompositionInput,
  EvidencePointer,
  GeneratorOutput,
  GeneratorRequest,
  NarrativeGenerator,
  ProjectEvaluation,
  SelectionState,
} from "./contracts";
import { CompositionError, generateBoundedNarrative } from "./generator";
import { independentPublicLeakScan, walkPublicLeaves, type PublicContact, type PublicProjection, type PublicResumeInput } from "./projection";
import { reconcileProjects } from "./selection";

type EvidenceGraphEntry = {
  publicField: string;
  kind: "verbatim" | "generated" | "presentation" | "transformed";
  valueHash: `sha256:${string}`;
  references: string[];
};

type Candidate = {
  id: string;
  publicProjection: PublicProjection;
  selectionState: SelectionState;
  manifest: {
    id: string;
    pinnedInputs: {
      careerSnapshotId: string;
      githubSnapshotId: string;
      presentationPolicyId: string;
      priorSelectionStateId: string | null;
    };
    versions: CompositionInput["versions"];
    evidencePacket: EvidencePointer[];
    requestEvidenceHashes: Record<string, `sha256:${string}`>;
    generatedOutput: GeneratorOutput;
    evidenceGraph: EvidenceGraphEntry[];
    matchingDecisions: ProjectEvaluation["match"][];
    scoreBreakdowns: { repositoryId: string; score: ProjectEvaluation["score"] }[];
    stabilityHistory: SelectionState["comparisons"];
    transformations: { field: string; kind: "whitespace" | "typography" | "url" | "date" | "email-link" | "date-display"; original: string; rendered: string }[];
    thesis: { selected: "primary" | "fallback"; value: string; reason: string };
    validationOutcomes: { name: string; outcome: "passed" }[];
    hashes: { candidateHash: `sha256:${string}`; publicOutputHash: `sha256:${string}` };
    deploymentId: null;
    recoveryDeploymentId: null;
  };
  hashes: {
    semanticSourceHash: `sha256:${string}`;
    renderedContentHash: `sha256:${string}`;
    candidateHash: `sha256:${string}`;
    publicManifestHash: `sha256:${string}`;
  };
  completeness: { missing: string[]; duplicates: string[] };
};

type PreservedState = {
  careerSnapshotId: string;
  githubSnapshotId: string;
  priorSelectionStateId: string | null;
  lastValidCandidateId: string | null;
};

export type CompositionResult =
  | { status: "accepted"; candidate: Candidate; preserved: PreservedState }
  | {
      status: "rejected";
      code: "material-source-conflict" | "github-snapshot-stale" | "generation-invalid" | "privacy-invalid" | "completeness-invalid";
      message: string;
      preserved: PreservedState;
    };

function display<T extends { original: string; normalized?: string }>(value: T): string {
  return value.normalized ?? value.original;
}

function ordered<T extends { sourceOrder: number }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.sourceOrder - right.sourceOrder);
}

function evidenceId(source: string, snapshotId: string, fieldPath: string): string {
  return `evidence:${sha256(`${source}:${snapshotId}:${fieldPath}`).slice(7, 31)}`;
}

function pointer(
  source: EvidencePointer["source"],
  snapshotId: string,
  fieldPath: string,
  value: string,
): EvidencePointer {
  return { id: evidenceId(source, snapshotId, fieldPath), source, snapshotId, fieldPath, value, valueHash: sha256(value) };
}

function careerEvidence(career: CareerSnapshot): EvidencePointer[] {
  const values: EvidencePointer[] = [];
  const add = (path: string, value: { original: string; normalized?: string }) =>
    values.push(pointer("career", career.id, path, display(value)));
  add("person.name", career.person.name);
  if (career.person.location) add("person.location", career.person.location);
  career.person.contacts.forEach((contact) => add(`person.contacts.${contact.kind}`, contact.value));
  ordered(career.experience).forEach((role) => {
    const root = `experience.${role.id}`;
    add(`${root}.organization`, role.organization);
    add(`${root}.title`, role.title);
    if (role.location) add(`${root}.location`, role.location);
    add(`${root}.dates.start`, role.dates.start);
    if (role.dates.end) add(`${root}.dates.end`, role.dates.end);
    ordered(role.bullets).forEach((bullet, index) => add(`${root}.bullets.${index}`, bullet.text));
  });
  ordered(career.education).forEach((education) => {
    const root = `education.${education.id}`;
    add(`${root}.institution`, education.institution);
    add(`${root}.degree`, education.degree);
    if (education.location) add(`${root}.location`, education.location);
    add(`${root}.dates.start`, education.dates.start);
    if (education.dates.end) add(`${root}.dates.end`, education.dates.end);
    if (education.gpa) add(`${root}.gpa`, education.gpa);
    ordered(education.coursework ?? []).forEach((item, index) => add(`${root}.coursework.${index}`, item.text));
    ordered(education.details).forEach((item, index) => add(`${root}.details.${index}`, item.text));
  });
  ordered(career.projects).forEach((project) => {
    const root = `projects.${project.id}`;
    add(`${root}.name`, project.name);
    project.technologies.forEach((technology, index) => add(`${root}.technologies.${index}`, technology));
    project.sourceLinks.forEach((link, index) => add(`${root}.sourceLinks.${index}`, link));
    ordered(project.bullets).forEach((bullet, index) => add(`${root}.bullets.${index}`, bullet.text));
  });
  ordered(career.skills).forEach((group, groupIndex) => {
    add(`skills.${groupIndex}.name`, group.name);
    group.items.forEach((item, itemIndex) => add(`skills.${groupIndex}.items.${itemIndex}`, item));
  });
  ordered(career.optionalSections).forEach((section, sectionIndex) => {
    add(`optionalSections.${sectionIndex}.heading`, section.heading);
    ordered(section.items).forEach((item, itemIndex) => add(`optionalSections.${sectionIndex}.items.${itemIndex}`, item.text));
  });
  return values;
}

function githubEvidence(github: GitHubSnapshot, selectedIds: Set<string>): EvidencePointer[] {
  const values: EvidencePointer[] = [];
  for (const repository of github.repositories.filter(({ id }) => selectedIds.has(id))) {
    const root = `repositories.${repository.id}`;
    values.push(pointer("github", github.id, `${root}.name`, repository.name));
    values.push(pointer("github", github.id, `${root}.url`, repository.url));
    if (repository.description) values.push(pointer("github", github.id, `${root}.description`, repository.description));
    if (repository.homepageUrl) values.push(pointer("github", github.id, `${root}.homepageUrl`, repository.homepageUrl));
    repository.topics.forEach((topic, index) => values.push(pointer("github", github.id, `${root}.topics.${index}`, topic)));
    repository.languages.forEach((language, index) => values.push(pointer("github", github.id, `${root}.languages.${index}`, language.name)));
    repository.documents.forEach((document, index) =>
      values.push(pointer("github", github.id, `${root}.documents.${index}.renderedContent`, document.renderedContent)),
    );
  }
  values.push(pointer("github", github.id, "collectedAt", github.collectedAt));
  return values;
}

function presentationEvidence(input: CompositionInput): EvidencePointer[] {
  const values = [
    ["primaryThesis", input.policy.primaryThesis],
    ["fallbackThesis", input.policy.fallbackThesis],
    ["kicker", input.policy.kicker],
    ["roleLine", input.policy.roleLine],
    ["metadata.title", input.policy.metadata.title],
    ["metadata.description", input.policy.metadata.description],
    ["resume.htmlPath", input.policy.resume.htmlPath],
    ["resume.pdfPath", input.policy.resume.pdfPath],
    ["contacts.email.label", "Email Michael"],
    ["contacts.github.label", "Michael Vasandani on GitHub"],
    ["contacts.linkedin.label", "LinkedIn profile"],
  ] as const;
  return values.map(([path, value]) => pointer("presentation", input.policy.id, path, value));
}

function sanitizedEvidence(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/(?:ignore (?:all|previous) instructions|system prompt|cite evidence:[^\s]+)/gi, "[untrusted instruction]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
}

function generationRequest(
  input: CompositionInput,
  selected: (ProjectEvaluation & { order: number })[],
  evidence: EvidencePointer[],
  thesis: "primary" | "fallback",
): GeneratorRequest {
  const careerIds = evidence.filter(({ source, fieldPath }) => source === "career" && fieldPath.includes(".bullets.")).map(({ id }) => id);
  const thesisId = evidence.find(({ source, fieldPath }) => source === "presentation" && fieldPath === `${thesis}Thesis`)!.id;
  const requests: GeneratorRequest["requests"] = [
    { id: "card.proof", placement: "card", minimumWords: 15, maximumWords: 25, evidenceIds: [...careerIds.slice(0, 2), thesisId], subject: "portfolio" },
    { id: "about.lede", placement: "about", minimumWords: 8, maximumWords: 30, evidenceIds: [...careerIds.slice(0, 2), thesisId], subject: "about" },
    { id: "about.body", placement: "about", minimumWords: 12, maximumWords: 60, evidenceIds: careerIds.length ? careerIds : [thesisId], subject: "about" },
  ];
  for (const project of selected) {
    const root = `repositories.${project.repositoryId}.`;
    const projectEvidence = evidence.filter(({ source, fieldPath }) => source === "github" && fieldPath.startsWith(root)).map(({ id }) => id);
    requests.push({
      id: `project.${project.repositoryId}`,
      placement: "project",
      minimumWords: 12,
      maximumWords: 30,
      evidenceIds: projectEvidence,
      subject: project.repositoryName,
    });
  }
  return {
    schemaVersion: 1,
    generatorVersion: input.versions.generatorVersion,
    promptVersion: input.versions.promptVersion,
    evidence: evidence.map(({ id, value }) => ({ id, text: sanitizedEvidence(value) })),
    requests,
  };
}

function selectedThesis(input: CompositionInput): "primary" | "fallback" {
  const supportingText = canonicalJson({
    experience: input.career.experience,
    projects: input.career.projects,
    repositories: input.github.repositories.map(({ description, topics, documents }) => ({ description, topics, documents })),
  });
  return /\b(?:agentic|agent|ai|llm|machine learning)\b/i.test(supportingText) ? "primary" : "fallback";
}

function derivedConflicts(input: CompositionInput, selection: SelectionState): CompositionInput["sourceConflicts"] {
  const conflicts = [...input.sourceConflicts];
  for (const selected of selection.selected.filter(({ match }) => match.kind === "alias-corroborated" && match.resumeProjectId)) {
    const project = input.career.projects.find(({ id }) => id === selected.match.resumeProjectId)!;
    const repository = input.github.repositories.find(({ id }) => id === selected.repositoryId)!;
    const githubLinks = project.sourceLinks.map(display).filter((value) => {
      try { return new URL(value).hostname.toLocaleLowerCase() === "github.com"; } catch { return false; }
    });
    if (githubLinks.length && !githubLinks.some((value) => value.toLocaleLowerCase().replace(/\/$/, "") === repository.url.toLocaleLowerCase().replace(/\/$/, ""))) {
      conflicts.push({
        field: `projects.${project.id}.repositoryUrl`,
        careerValue: githubLinks.join(", "),
        githubValue: repository.url,
        historicalStatesExplicit: false,
      });
    }
  }
  return conflicts;
}

function requestEvidenceHashes(request: GeneratorRequest): Record<string, `sha256:${string}`> {
  const evidence = new Map(request.evidence.map((item) => [item.id, item.text]));
  return Object.fromEntries(request.requests.map((item) => [item.id, sha256(canonicalJson({
    request: item,
    evidence: item.evidenceIds.map((id) => ({ id, text: evidence.get(id) })),
    generatorVersion: request.generatorVersion,
    promptVersion: request.promptVersion,
  }))]));
}

async function generateOrReuseNarrative(
  input: CompositionInput & { generator: NarrativeGenerator },
  request: GeneratorRequest,
): Promise<{ output: GeneratorOutput; hashes: Record<string, `sha256:${string}`> }> {
  const hashes = requestEvidenceHashes(request);
  const reusable = new Map(
    (input.priorNarrative?.output.sentences ?? []).filter((sentence) =>
      input.priorNarrative?.requestEvidenceHashes[sentence.requestId] === hashes[sentence.requestId],
    ).map((sentence) => [sentence.requestId, sentence]),
  );
  const missing = request.requests.filter(({ id }) => !reusable.has(id));
  let generated: GeneratorOutput | null = null;
  if (missing.length) {
    const missingIds = new Set(missing.flatMap(({ evidenceIds }) => evidenceIds));
    generated = await generateBoundedNarrative(input.generator, {
      ...request,
      evidence: request.evidence.filter(({ id }) => missingIds.has(id)),
      requests: missing,
    });
  }
  const merged: GeneratorOutput = {
    schemaVersion: 1,
    provider: generated?.provider ?? input.priorNarrative!.output.provider,
    model: generated?.model ?? input.priorNarrative!.output.model,
    sentences: request.requests.map(({ id }) => reusable.get(id) ?? generated!.sentences.find(({ requestId }) => requestId === id)!),
  };
  const output = await generateBoundedNarrative({ generate: async () => merged }, request);
  return { output, hashes };
}

function contactLinks(input: CompositionInput): PublicContact[] {
  const labels = { email: "Email Michael", github: "Michael Vasandani on GitHub", linkedin: "LinkedIn profile" } as const;
  const contacts = new Map(input.career.person.contacts.map((contact) => [contact.kind, display(contact.value)]));
  return input.policy.publicContactKinds.map((kind) => {
    const value = contacts.get(kind);
    if (!value) throw new Error(`Required ${kind} contact is absent.`);
    return { kind, label: labels[kind], href: kind === "email" ? `mailto:${value}` : value };
  });
}

function dateDisplay(value: { start: { original: string; normalized?: string }; end?: { original: string; normalized?: string }; current: boolean }): string {
  return `${display(value.start)} – ${value.current ? "Present" : value.end ? display(value.end) : ""}`.trim();
}

function buildProjection(
  input: CompositionInput,
  selected: (ProjectEvaluation & { order: number })[],
  narrative: GeneratorOutput,
  manifestHash: `sha256:${string}`,
): PublicProjection {
  const sentence = new Map(narrative.sentences.map((item) => [item.requestId, item.text]));
  const contacts = contactLinks(input);
  const experience = ordered(input.career.experience).map((role) => ({
    organization: display(role.organization),
    title: display(role.title),
    ...(role.location ? { location: display(role.location) } : {}),
    dates: dateDisplay(role.dates),
    bullets: ordered(role.bullets).map(({ text }) => display(text)),
  }));
  const education = ordered(input.career.education).map((item) => ({
    institution: display(item.institution),
    degree: display(item.degree),
    ...(item.location ? { location: display(item.location) } : {}),
    dates: dateDisplay(item.dates),
    ...(item.gpa ? { gpa: display(item.gpa) } : {}),
    coursework: ordered(item.coursework ?? []).map(({ text }) => display(text)),
    details: ordered(item.details).map(({ text }) => display(text)),
  }));
  const skills = ordered(input.career.skills).map((group) => ({
    name: display(group.name),
    items: group.items.map(display),
  }));
  const optionalSections = ordered(input.career.optionalSections).map((section) => ({
    kind: section.kind,
    heading: display(section.heading),
    items: ordered(section.items).map(({ text }) => display(text)),
  }));
  const portfolioProjects = selected.map((item) => {
    const repository = input.github.repositories.find(({ id }) => id === item.repositoryId)!;
    const profile = input.profiles.find(({ repositoryId }) => repositoryId === item.repositoryId)!;
    const careerProject = item.match.resumeProjectId
      ? input.career.projects.find(({ id }) => id === item.match.resumeProjectId)
      : undefined;
    return {
      name: repository.name,
      technologies: repository.languages.map(({ name }) => name),
      description: sentence.get(`project.${repository.id}`)!,
      repositoryHref: repository.url,
      ...(repository.homepageUrl && profile.verifiedDemonstration?.fieldPath === `repositories.${repository.id}.homepageUrl` &&
          profile.verifiedDemonstration.url === repository.homepageUrl && profile.verifiedDemonstration.status === "reachable" &&
          profile.verifiedDemonstration.repositoryIdentityConfirmed === true &&
          Date.parse(profile.verifiedDemonstration.checkedAt) <= Date.parse(input.runAt)
        ? { demonstrationHref: repository.homepageUrl }
        : {}),
      bullets: careerProject ? ordered(careerProject.bullets).map(({ text }) => display(text)) : [],
    };
  });
  const matchedRepository = new Map(
    selected.filter(({ match }) => match.resumeProjectId).map((item) => [item.match.resumeProjectId!, input.github.repositories.find(({ id }) => id === item.repositoryId)!.url]),
  );
  const careerProjects = ordered(input.career.projects).map((project) => ({
    name: display(project.name),
    technologies: project.technologies.map(display),
    ...(matchedRepository.has(project.id) ? { repositoryHref: matchedRepository.get(project.id)! } : {}),
    bullets: ordered(project.bullets).map(({ text }) => display(text)),
  }));
  const resumeInput: PublicResumeInput = {
    name: display(input.career.person.name),
    ...(input.career.person.location ? { location: display(input.career.person.location) } : {}),
    contacts,
    experience,
    education,
    projects: careerProjects,
    skills,
    optionalSections,
  };
  const name = display(input.career.person.name);
  const location = input.career.person.location ? display(input.career.person.location) : undefined;
  return {
    schemaVersion: 1,
    metadata: structuredClone(input.policy.metadata),
    sections: [
      { kind: "card", name, ...(location ? { location } : {}), kicker: input.policy.kicker, role: input.policy.roleLine, proof: sentence.get("card.proof")!, contacts },
      { kind: "about", lede: sentence.get("about.lede")!, body: sentence.get("about.body")! },
      { kind: "experience", entries: experience },
      { kind: "projects", entries: portfolioProjects },
      { kind: "resume", education, skills, optionalSections, htmlPath: input.policy.resume.htmlPath, pdfPath: input.policy.resume.pdfPath },
      { kind: "links", contacts: structuredClone(contacts) },
    ],
    resume: { html: structuredClone(resumeInput), pdf: structuredClone(resumeInput) },
    lastUpdated: input.github.collectedAt,
    manifestHash,
  };
}

function completeness(input: CompositionInput, projection: PublicProjection, selected: ProjectEvaluation[]): Candidate["completeness"] {
  const missing: string[] = [];
  const duplicates: string[] = [];
  const [cardSection, , experienceSection, projectsSection, resumeSection, linksSection] = projection.sections;
  const experience = experienceSection.entries;
  if (experience.length !== input.career.experience.length) missing.push("experience-count");
  input.career.experience.forEach((role, index) => {
    if (canonicalJson(experience[index]?.bullets) !== canonicalJson(ordered(role.bullets).map(({ text }) => display(text)))) missing.push(`experience.${role.id}.bullets`);
  });
  if (projectsSection.entries.length !== selected.length) missing.push("selected-project-count");
  if (resumeSection.education.length !== input.career.education.length) missing.push("education-count");
  if (resumeSection.skills.length !== input.career.skills.length) missing.push("skills-count");
  if (resumeSection.optionalSections.length !== input.career.optionalSections.length) missing.push("optional-section-count");
  if (projection.resume.html.projects.length !== input.career.projects.length) missing.push("public-resume-project-count");
  if (canonicalJson(projection.resume.html) !== canonicalJson(projection.resume.pdf)) missing.push("resume-artifact-input-diff");
  // Keep this source-side comparison independent from buildProjection so a projection regression cannot validate itself.
  const expectedExperience = ordered(input.career.experience).map((role) => ({
    organization: display(role.organization),
    title: display(role.title),
    ...(role.location ? { location: display(role.location) } : {}),
    dates: dateDisplay(role.dates),
    bullets: ordered(role.bullets).map(({ text }) => display(text)),
  }));
  if (canonicalJson(experience) !== canonicalJson(expectedExperience)) missing.push("experience-verbatim-order");
  const expectedCareerProjects = ordered(input.career.projects).map((project) => ({
    name: display(project.name),
    technologies: project.technologies.map(display),
    bullets: ordered(project.bullets).map(({ text }) => display(text)),
  }));
  const actualCareerProjects = projection.resume.html.projects.map((project) => ({
    name: project.name,
    technologies: project.technologies,
    bullets: project.bullets,
  }));
  if (canonicalJson(actualCareerProjects) !== canonicalJson(expectedCareerProjects)) missing.push("resume-project-verbatim-order");
  const expectedEducation = ordered(input.career.education).map((item) => ({
    institution: display(item.institution),
    degree: display(item.degree),
    ...(item.location ? { location: display(item.location) } : {}),
    dates: dateDisplay(item.dates),
    ...(item.gpa ? { gpa: display(item.gpa) } : {}),
    coursework: ordered(item.coursework ?? []).map(({ text }) => display(text)),
    details: ordered(item.details).map(({ text }) => display(text)),
  }));
  const expectedSkills = ordered(input.career.skills).map((group) => ({ name: display(group.name), items: group.items.map(display) }));
  const expectedOptional = ordered(input.career.optionalSections).map((section) => ({
    kind: section.kind,
    heading: display(section.heading),
    items: ordered(section.items).map(({ text }) => display(text)),
  }));
  if (canonicalJson(resumeSection.education) !== canonicalJson(expectedEducation)) missing.push("education-verbatim-order");
  if (canonicalJson(resumeSection.skills) !== canonicalJson(expectedSkills)) missing.push("skills-verbatim-order");
  if (canonicalJson(resumeSection.optionalSections) !== canonicalJson(expectedOptional)) missing.push("optional-sections-verbatim-order");
  const publicResume = projection.resume.html;
  if (canonicalJson(publicResume.experience) !== canonicalJson(expectedExperience)) missing.push("public-resume-experience");
  if (canonicalJson(publicResume.education) !== canonicalJson(expectedEducation)) missing.push("public-resume-education");
  if (canonicalJson(publicResume.skills) !== canonicalJson(expectedSkills)) missing.push("public-resume-skills");
  if (canonicalJson(publicResume.optionalSections) !== canonicalJson(expectedOptional)) missing.push("public-resume-optional-sections");
  const expectedContacts = input.policy.publicContactKinds.map((kind) => ({ kind, href: kind === "email"
    ? `mailto:${display(input.career.person.contacts.find((contact) => contact.kind === kind)!.value)}`
    : display(input.career.person.contacts.find((contact) => contact.kind === kind)!.value) }));
  const actualContacts = cardSection.contacts.map(({ kind, href }) => ({ kind, href }));
  if (canonicalJson(actualContacts) !== canonicalJson(expectedContacts)) missing.push("contact-verbatim-order");
  const expectedName = display(input.career.person.name);
  const expectedLocation = input.career.person.location ? display(input.career.person.location) : undefined;
  if (cardSection.name !== expectedName || cardSection.location !== expectedLocation) missing.push("card-identity");
  if (publicResume.name !== expectedName || publicResume.location !== expectedLocation) missing.push("public-resume-identity");
  if (canonicalJson(publicResume.contacts.map(({ kind, href }) => ({ kind, href }))) !== canonicalJson(expectedContacts)) {
    missing.push("public-resume-contacts");
  }
  if (canonicalJson(linksSection.contacts.map(({ kind, href }) => ({ kind, href }))) !== canonicalJson(expectedContacts)) {
    missing.push("links-contacts");
  }
  const expectedPortfolioProjects = selected.map((item) => {
    const repository = input.github.repositories.find(({ id }) => id === item.repositoryId)!;
    const profile = input.profiles.find(({ repositoryId }) => repositoryId === item.repositoryId)!;
    return {
      name: repository.name,
      technologies: repository.languages.map(({ name }) => name),
      repositoryHref: repository.url,
      demonstrationHref: profile.verifiedDemonstration?.url,
    };
  });
  const actualPortfolioProjects = projectsSection.entries.map(({ name, technologies, repositoryHref, demonstrationHref }) => ({
    name,
    technologies,
    repositoryHref,
    demonstrationHref,
  }));
  if (canonicalJson(actualPortfolioProjects) !== canonicalJson(expectedPortfolioProjects)) missing.push("portfolio-project-fields-order");
  selected.filter(({ match }) => match.resumeProjectId).forEach((project, index) => {
    const sourceProject = input.career.projects.find(({ id }) => id === project.match.resumeProjectId)!;
    const renderedProject = projectsSection.entries.find(({ repositoryHref }) =>
      repositoryHref === input.github.repositories.find(({ id }) => id === project.repositoryId)!.url,
    );
    if (canonicalJson(renderedProject?.bullets) !== canonicalJson(ordered(sourceProject.bullets).map(({ text }) => display(text)))) {
      missing.push(`matched-project-bullets.${index}`);
    }
  });
  for (const kind of input.policy.publicContactKinds) {
    if (cardSection.contacts.filter((contact) => contact.kind === kind).length !== 1) missing.push(`card-contact.${kind}`);
    if (linksSection.contacts.filter((contact) => contact.kind === kind).length !== 1) missing.push(`links-contact.${kind}`);
  }
  const selectedIds = selected.map(({ repositoryId }) => repositoryId);
  for (const id of new Set(selectedIds)) if (selectedIds.filter((value) => value === id).length > 1) duplicates.push(id);
  for (const group of [input.career.experience, input.career.education, input.career.projects]) {
    const ids = group.map(({ id }) => id);
    for (const id of new Set(ids)) if (ids.filter((value) => value === id).length > 1) duplicates.push(id);
  }
  return { missing, duplicates };
}

function evidenceGraph(projection: PublicProjection, evidence: EvidencePointer[], narrative: GeneratorOutput): EvidenceGraphEntry[] {
  const byValue = new Map<string, string[]>();
  for (const item of evidence) byValue.set(item.value, [...(byValue.get(item.value) ?? []), item.id]);
  const generated = new Map(narrative.sentences.map((sentence) => [sentence.text, sentence.clauses.flatMap(({ evidenceIds }) => evidenceIds)]));
  const entries: EvidenceGraphEntry[] = [];
  walkPublicLeaves(projection, (item, path) => {
    if (typeof item !== "string" || path === "manifestHash" || path.endsWith(".kind")) return;
    const generatedReferences = generated.get(item);
    const direct = byValue.get(item) ?? [];
    let references = generatedReferences ?? direct;
    let kind: EvidenceGraphEntry["kind"] = generatedReferences ? "generated" : "verbatim";
    if (!references.length && item.startsWith("mailto:")) {
      references = byValue.get(item.slice("mailto:".length)) ?? [];
      kind = "transformed";
    }
    if (!references.length && / – /.test(item)) {
      references = evidence.filter(({ value }) => item.includes(value)).map(({ id }) => id);
      kind = "transformed";
    }
    if (!references.length && path === "lastUpdated") references = evidence.filter(({ fieldPath }) => fieldPath === "collectedAt").map(({ id }) => id);
    entries.push({ publicField: path, kind, valueHash: sha256(item), references: [...new Set(references)] });
  });
  return entries;
}

function preserved(input: CompositionInput): PreservedState {
  return {
    careerSnapshotId: input.career.id,
    githubSnapshotId: input.github.id,
    priorSelectionStateId: input.priorState?.id ?? null,
    lastValidCandidateId: input.lastValidCandidateId,
  };
}

function recordedNormalizations(career: CareerSnapshot): Candidate["manifest"]["transformations"] {
  const transformations: Candidate["manifest"]["transformations"] = [];
  function visit(value: unknown, path: string): void {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}.${index}`));
    if (!value || typeof value !== "object") return;
    if ("original" in value && "sourceLocation" in value) {
      const sourceValue = value as { original: string; normalized?: string; transformation?: string };
      if (sourceValue.normalized !== undefined && sourceValue.transformation !== undefined) {
        transformations.push({
          field: path,
          kind: sourceValue.transformation as "whitespace" | "typography" | "url" | "date",
          original: sourceValue.original,
          rendered: sourceValue.normalized,
        });
      }
      return;
    }
    Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key));
  }
  visit(career, "career");
  return transformations;
}

export async function composeCandidate(input: CompositionInput & { generator: NarrativeGenerator }): Promise<CompositionResult> {
  const preservedState = preserved(input);
  if (Date.parse(input.runAt) - Date.parse(input.github.collectedAt) > 48 * 60 * 60 * 1_000) {
    return { status: "rejected", code: "github-snapshot-stale", message: "GitHub evidence is older than 48 hours.", preserved: preservedState };
  }

  const selection = reconcileProjects(input);
  const conflict = derivedConflicts(input, selection.state).find(({ historicalStatesExplicit }) => !historicalStatesExplicit);
  if (conflict) {
    return { status: "rejected", code: "material-source-conflict", message: `Unresolved source conflict at ${conflict.field}.`, preserved: preservedState };
  }
  const selectedIds = new Set(selection.selected.map(({ repositoryId }) => repositoryId));
  const evidence = [...careerEvidence(input.career), ...githubEvidence(input.github, selectedIds), ...presentationEvidence(input)];
  const thesis = selectedThesis(input);
  const request = generationRequest(input, selection.selected, evidence, thesis);
  let generatedResult: Awaited<ReturnType<typeof generateOrReuseNarrative>>;
  let narrative: GeneratorOutput;
  try {
    generatedResult = await generateOrReuseNarrative(input, request);
    narrative = generatedResult.output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Narrative generation failed.";
    return {
      status: "rejected",
      code: "generation-invalid",
      message: error instanceof CompositionError ? message : `Generator failed: ${message}`,
      preserved: preservedState,
    };
  }

  const semanticSourceHash = sha256(canonicalJson({
    careerContentHash: input.career.contentHash,
    githubEvidenceHash: input.github.evidenceHash,
    policyContentHash: input.policy.contentHash,
    selectionContentHash: selection.state.contentHash,
  }));
  let placeholderProjection: PublicProjection;
  try {
    placeholderProjection = buildProjection(input, selection.selected, narrative, sha256("pending"));
  } catch (error) {
    return { status: "rejected", code: "completeness-invalid", message: error instanceof Error ? error.message : "Public projection could not be assembled.", preserved: preservedState };
  }
  const renderedContentHash = sha256(canonicalJson({ ...placeholderProjection, manifestHash: undefined }));
  const candidateHash = sha256(canonicalJson({ semanticSourceHash, renderedContentHash, narrative, versions: input.versions }));
  const publicManifestHash = sha256(canonicalJson({ schemaVersion: 1, candidateHash, renderedContentHash }));
  const projection = buildProjection(input, selection.selected, narrative, publicManifestHash);
  const complete = completeness(input, projection, selection.selected);
  if (complete.missing.length || complete.duplicates.length) {
    return { status: "rejected", code: "completeness-invalid", message: "Public projection is incomplete or duplicated.", preserved: preservedState };
  }
  const leaks = independentPublicLeakScan(projection);
  if (leaks.length) {
    return { status: "rejected", code: "privacy-invalid", message: `Public leak scan failed: ${leaks.join(", ")}`, preserved: preservedState };
  }
  const graph = evidenceGraph(projection, evidence, narrative);
  if (graph.some(({ references }) => references.length === 0)) {
    return { status: "rejected", code: "completeness-invalid", message: "A rendered field has no evidence reference.", preserved: preservedState };
  }
  const manifestValue = {
    pinnedInputs: {
      careerSnapshotId: input.career.id,
      githubSnapshotId: input.github.id,
      presentationPolicyId: input.policy.id,
      priorSelectionStateId: input.priorState?.id ?? null,
    },
    versions: input.versions,
    evidencePacket: evidence,
    requestEvidenceHashes: generatedResult.hashes,
    generatedOutput: narrative,
    evidenceGraph: graph,
    matchingDecisions: selection.evaluations.map(({ match }) => match),
    scoreBreakdowns: selection.evaluations.map(({ repositoryId, score }) => ({ repositoryId, score })),
    stabilityHistory: selection.comparisons,
    thesis: {
      selected: thesis,
      value: thesis === "primary" ? input.policy.primaryThesis : input.policy.fallbackThesis,
      reason: thesis === "primary" ? "source evidence supports agentic-AI framing" : "source evidence does not support agentic-AI framing",
    },
    validationOutcomes: [
      { name: "generation-contract", outcome: "passed" as const },
      { name: "completeness", outcome: "passed" as const },
      { name: "privacy", outcome: "passed" as const },
      { name: "provenance", outcome: "passed" as const },
    ],
    hashes: { candidateHash, publicOutputHash: renderedContentHash },
    deploymentId: null,
    recoveryDeploymentId: null,
    transformations: [
      ...recordedNormalizations(input.career),
      ...input.career.person.contacts.filter(({ kind }) => kind === "email").map(({ value }) => ({ field: "person.contacts.email", kind: "email-link" as const, original: display(value), rendered: `mailto:${display(value)}` })),
      ...input.career.experience.map(({ id, dates }) => ({ field: `experience.${id}.dates`, kind: "date-display" as const, original: canonicalJson(dates), rendered: dateDisplay(dates) })),
      ...input.career.education.map(({ id, dates }) => ({ field: `education.${id}.dates`, kind: "date-display" as const, original: canonicalJson(dates), rendered: dateDisplay(dates) })),
    ],
  };
  const manifestHash = sha256(canonicalJson(manifestValue));
  return {
    status: "accepted",
    preserved: preservedState,
    candidate: {
      id: `candidate:${candidateHash.slice(7)}`,
      publicProjection: projection,
      selectionState: selection.state,
      manifest: { id: `manifest:${manifestHash.slice(7)}`, ...manifestValue },
      hashes: { semanticSourceHash, renderedContentHash, candidateHash, publicManifestHash },
      completeness: complete,
    },
  };
}
