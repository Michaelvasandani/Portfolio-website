import { canonicalJson, sha256 } from "../github/canonical";
import type { CompositionInput, MatchDecision, ProjectEvaluation, Score, SelectionState, StabilityComparison } from "./contracts";

type SelectionInput = Omit<CompositionInput, "sourceConflicts" | "lastValidCandidateId" | "versions">;

function normalizedUrl(value: string): string {
  return value.trim().toLowerCase().replace(/\/$/, "");
}

function normalizedName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveEvidencePath(input: SelectionInput, path: string): unknown {
  const segments = path.split(".");
  const source = segments.shift();
  let value: unknown;
  if (source === "projects") {
    const id = segments.shift();
    value = input.career.projects.find((project) => project.id === id);
  } else if (source === "repositories") {
    const id = segments.shift();
    value = input.github.repositories.find((repository) => repository.id === id);
  }
  for (const segment of segments) {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) {
      const index = Number(segment);
      value = Number.isInteger(index) ? value[index] : value.find((item) =>
        item && typeof item === "object" && "id" in item && item.id === segment,
      );
    } else if (typeof value === "object") {
      value = (value as Record<string, unknown>)[segment];
    } else return undefined;
  }
  if (value && typeof value === "object" && "original" in value) return (value as { original: string; normalized?: string }).normalized ?? (value as { original: string }).original;
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text: { original: string; normalized?: string } }).text;
    return text.normalized ?? text.original;
  }
  if (value && typeof value === "object" && "name" in value) return (value as { name: string }).name;
  if (value && typeof value === "object" && "renderedContent" in value) return (value as { renderedContent: string }).renderedContent;
  return value;
}

export function corroborates(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const ignored = new Set(["a", "an", "and", "the", "with", "built", "software", "tested"]);
  const leftTerms = new Set(left.toLocaleLowerCase().match(/[a-z0-9+#-]+/g)?.filter((term) => !ignored.has(term)) ?? []);
  return (right.toLocaleLowerCase().match(/[a-z0-9+#-]+/g) ?? []).some((term) => leftTerms.has(term));
}

function matchFor(input: SelectionInput, repositoryId: string, repositoryUrl: string): MatchDecision {
  const direct = input.career.projects.filter((project) =>
    project.sourceLinks.some((link) => normalizedUrl(link.normalized ?? link.original) === normalizedUrl(repositoryUrl)),
  );
  if (direct.length === 1) {
    const project = direct[0]!;
    return {
      kind: "direct-url",
      resumeProjectId: project.id,
      candidateProjectIds: [project.id],
      evidencePaths: [`projects.${project.id}.sourceLinks`, `repositories.${repositoryId}.url`],
    };
  }
  if (direct.length > 1) {
    return {
      kind: "ambiguous",
      resumeProjectId: null,
      candidateProjectIds: direct.map(({ id }) => id),
      evidencePaths: direct.flatMap(({ id }) => [`projects.${id}.sourceLinks`, `repositories.${repositoryId}.url`]),
    };
  }

  const profile = input.profiles.find((candidate) => candidate.repositoryId === repositoryId);
  const corroborated = (profile?.aliasMatches ?? []).filter((candidate) => {
    const project = input.career.projects.find(({ id }) => id === candidate.careerProjectId);
    if (!project || normalizedName(project.name.normalized ?? project.name.original) !== normalizedName(candidate.alias)) return false;
    const careerFacts = new Set(candidate.corroboratingFacts.map(({ careerPath }) => careerPath));
    const githubFacts = new Set(candidate.corroboratingFacts.map(({ githubPath }) => githubPath));
    return candidate.corroboratingFacts.length >= 2 && careerFacts.size >= 2 && githubFacts.size >= 2 &&
      candidate.corroboratingFacts.every(({ careerPath, githubPath }) =>
        corroborates(resolveEvidencePath(input, careerPath), resolveEvidencePath(input, githubPath)),
      );
  });
  if (corroborated.length === 1) {
    const match = corroborated[0]!;
    return {
      kind: "alias-corroborated",
      resumeProjectId: match.careerProjectId,
      candidateProjectIds: [match.careerProjectId],
      evidencePaths: match.corroboratingFacts.flatMap(({ careerPath, githubPath }) => [careerPath, githubPath]),
    };
  }
  if (corroborated.length > 1) {
    return {
      kind: "ambiguous",
      resumeProjectId: null,
      candidateProjectIds: corroborated.map(({ careerProjectId }) => careerProjectId),
      evidencePaths: corroborated.flatMap(({ corroboratingFacts }) =>
        corroboratingFacts.flatMap(({ careerPath, githubPath }) => [careerPath, githubPath]),
      ),
    };
  }
  return { kind: "none", resumeProjectId: null, candidateProjectIds: [], evidencePaths: [] };
}

function recencyPoints(activity: string | null, runAt: string): number {
  if (!activity) return 0;
  const days = (Date.parse(runAt) - Date.parse(activity)) / 86_400_000;
  if (days < 0) return 0;
  if (days <= 90) return 5;
  if (days <= 365) return 3;
  if (days <= 730) return 1;
  return 0;
}

function evaluate(input: SelectionInput): ProjectEvaluation[] {
  return input.github.repositories.map((repository) => {
    const profile = input.profiles.find(({ repositoryId }) => repositoryId === repository.id);
    const match = matchFor(input, repository.id, repository.url);
    const reasons: string[] = [];
    if (repository.visibility !== "public") reasons.push("not-public");
    if (repository.fork) reasons.push("fork");
    if (repository.archived) reasons.push("archived");
    if (repository.disabled) reasons.push("disabled");
    if (!repository.defaultBranch || repository.sourceStructure.length === 0) reasons.push("empty");
    if (!profile) reasons.push("assessment-missing");
    if (profile && !profile.original) reasons.push("not-original");
    if (profile && !profile.attributable) reasons.push("not-attributable");
    if (profile && !profile.substantive) reasons.push("not-substantive");
    if (profile && !profile.coherentPurpose) reasons.push("purpose-unclear");
    if (profile?.relevance === 0) reasons.push("not-relevant");

    const evidenceClasses = [
      Boolean(repository.description || repository.topics.length),
      repository.documents.length > 0,
      repository.sourceStructure.some(({ path }) => /^(?:src|app|lib|packages)\//.test(path)) ||
        repository.sourceStructure.some(({ path }) => /(?:test|spec|build|deploy|workflow)/i.test(path)),
      repository.releases.length > 0 || repository.meaningfulActivityAt !== null,
    ].filter(Boolean).length;
    const matched = match.kind === "direct-url" || match.kind === "alias-corroborated";
    if (evidenceClasses < 2 && !(evidenceClasses >= 1 && matched)) reasons.push("insufficient-evidence");

    const evidence = profile
      ? Object.values(profile.evidenceSignals).filter(Boolean).length * 5
      : 0;
    const score: Score = {
      pin: repository.pinPosition === null ? 0 : 35,
      resumeMatch: matched ? 30 : 0,
      evidence,
      relevance: profile?.relevance ?? 0,
      recency: recencyPoints(repository.meaningfulActivityAt, input.runAt),
      total: 0,
    };
    score.total = score.pin + score.resumeMatch + score.evidence + score.relevance + score.recency;
    return {
      repositoryId: repository.id,
      repositoryName: repository.name,
      eligible: reasons.length === 0,
      ineligibleReasons: reasons,
      pinned: repository.pinPosition !== null,
      pinPosition: repository.pinPosition,
      score,
      match,
      diversity: profile?.diversity ?? ["unknown", "unknown", "unknown"],
      evidencePaths: [...(profile?.narrativeEvidencePaths ?? []), ...match.evidencePaths],
    };
  });
}

function rank(left: ProjectEvaluation, right: ProjectEvaluation): number {
  return Number(right.pinned) - Number(left.pinned) ||
    right.score.total - left.score.total ||
    right.score.evidence - left.score.evidence ||
    right.score.relevance - left.score.relevance ||
    (left.pinPosition ?? Number.MAX_SAFE_INTEGER) - (right.pinPosition ?? Number.MAX_SAFE_INTEGER) ||
    left.repositoryName.localeCompare(right.repositoryName, undefined, { sensitivity: "base" });
}

function novelty(candidate: ProjectEvaluation, selected: ProjectEvaluation[]): number {
  const used = selected.map(({ diversity }) => diversity);
  return candidate.diversity.reduce(
    (count, value, index) => count + (used.some((dimensions) => dimensions[index] === value) ? 0 : 1),
    0,
  );
}

function desiredSelection(evaluations: ProjectEvaluation[], target: number): ProjectEvaluation[] {
  const pins = evaluations.filter(({ eligible, pinned }) => eligible && pinned).sort(rank);
  const selected = [...pins];
  const available = evaluations.filter(({ eligible, pinned }) => eligible && !pinned);
  while (selected.length < target && available.length) {
    available.sort(rank);
    const strongest = available[0]!;
    const band = available.filter(({ score }) => strongest.score.total - score.total <= 8);
    band.sort((left, right) => novelty(right, selected) - novelty(left, selected) || rank(left, right));
    const chosen = band[0]!;
    selected.push(chosen);
    available.splice(available.indexOf(chosen), 1);
  }
  return selected.sort(rank);
}

function changedMaterially(current: ProjectEvaluation[], prior: SelectionState): boolean {
  const previous = new Map(prior.evaluations.map((evaluation) => [evaluation.repositoryId, evaluation]));
  return current.some((evaluation) => {
    const old = previous.get(evaluation.repositoryId);
    return !old || old.eligible !== evaluation.eligible || old.pinned !== evaluation.pinned ||
      old.match.kind !== evaluation.match.kind || old.match.resumeProjectId !== evaluation.match.resumeProjectId;
  }) || prior.evaluations.some((evaluation) => !current.some(({ repositoryId }) => repositoryId === evaluation.repositoryId));
}

function onlyRecencyChanged(current: ProjectEvaluation[], prior: SelectionState): boolean {
  const previous = new Map(prior.evaluations.map((evaluation) => [evaluation.repositoryId, evaluation.score]));
  return current.every((evaluation) => {
    const old = previous.get(evaluation.repositoryId);
    return !old || old.pin === evaluation.score.pin && old.resumeMatch === evaluation.score.resumeMatch &&
      old.evidence === evaluation.score.evidence && old.relevance === evaluation.score.relevance;
  });
}

function stableSelection(
  desired: ProjectEvaluation[],
  evaluations: ProjectEvaluation[],
  prior: SelectionState | null,
): { selected: ProjectEvaluation[]; comparisons: StabilityComparison[] } {
  if (!prior || changedMaterially(evaluations, prior)) return { selected: desired, comparisons: [] };
  const current = new Map(evaluations.map((evaluation) => [evaluation.repositoryId, evaluation]));
  let selected = prior.selected.map(({ repositoryId }) => current.get(repositoryId)).filter((value): value is ProjectEvaluation => Boolean(value?.eligible));
  for (const pin of desired.filter(({ pinned }) => pinned)) {
    if (!selected.some(({ repositoryId }) => repositoryId === pin.repositoryId)) selected.push(pin);
  }
  const desiredIds = new Set(desired.map(({ repositoryId }) => repositoryId));
  const challengers = desired.filter(({ repositoryId, pinned }) => !pinned && !selected.some((item) => item.repositoryId === repositoryId));
  const incumbents = selected.filter(({ repositoryId, pinned }) => !pinned && !desiredIds.has(repositoryId)).sort(rank).reverse();
  const comparisons: StabilityComparison[] = [];
  for (const challenger of challengers) {
    const incumbent = incumbents.shift();
    if (!incumbent) continue;
    const lead = challenger.score.total - incumbent.score.total;
    const old = prior.comparisons.find(
      (comparison) => comparison.incumbentRepositoryId === incumbent.repositoryId && comparison.challengerRepositoryId === challenger.repositoryId,
    );
    const consecutiveRuns = lead >= 8 ? (old?.consecutiveRuns ?? 0) + 1 : 0;
    comparisons.push({
      incumbentRepositoryId: incumbent.repositoryId,
      challengerRepositoryId: challenger.repositoryId,
      lead,
      consecutiveRuns,
    });
    if (lead >= 8 && consecutiveRuns >= 2) {
      selected = selected.filter(({ repositoryId }) => repositoryId !== incumbent.repositoryId);
      selected.push(challenger);
    }
  }

  if (onlyRecencyChanged(evaluations, prior)) {
    const order = new Map(prior.selected.map(({ repositoryId }, index) => [repositoryId, index]));
    selected.sort((left, right) => (order.get(left.repositoryId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.repositoryId) ?? Number.MAX_SAFE_INTEGER));
  } else {
    selected.sort(rank);
    const order = new Map(prior.selected.map(({ repositoryId }, index) => [repositoryId, index]));
    selected.sort((left, right) => {
      const oldDifference = (order.get(left.repositoryId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.repositoryId) ?? Number.MAX_SAFE_INTEGER);
      return Math.abs(left.score.total - right.score.total) < 5 ? oldDifference : rank(left, right);
    });
  }
  return { selected, comparisons };
}

export function reconcileProjects(input: SelectionInput): {
  evaluations: ProjectEvaluation[];
  selected: (ProjectEvaluation & { order: number })[];
  comparisons: StabilityComparison[];
  state: SelectionState;
} {
  const evaluations = evaluate(input);
  const desired = desiredSelection(evaluations, input.policy.projectTarget);
  const stable = stableSelection(desired, evaluations, input.priorState);
  const selected = stable.selected.map((evaluation, order) => ({ ...evaluation, order }));
  const stateValue = {
    careerSnapshotId: input.career.id,
    githubSnapshotId: input.github.id,
    selected: selected.map((item) => ({
      repositoryId: item.repositoryId,
      repositoryName: item.repositoryName,
      order: item.order,
      score: item.score,
      match: item.match,
      eligible: item.eligible,
      pinned: item.pinned,
    })),
    evaluations,
    comparisons: stable.comparisons,
  };
  const contentHash = sha256(canonicalJson(stateValue));
  const state: SelectionState = {
    id: `selection:${contentHash.slice(7)}`,
    contentHash,
    ...stateValue,
  };
  return { evaluations, selected, comparisons: stable.comparisons, state };
}
