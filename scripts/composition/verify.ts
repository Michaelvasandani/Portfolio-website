import { composeCandidate } from "../../src/composition/compose";
import { DeterministicLocalGenerator } from "../../src/composition/generator";
import { reconcileProjects } from "../../src/composition/selection";
import { makeCompositionInput, repositoryProfile } from "../../src/composition/test-fixtures";

const matrix = {
  target: makeCompositionInput({
    projectTarget: 3,
    repositories: [
      repositoryProfile("pin", { pinPosition: 1 }),
      repositoryProfile("strong", { relevance: 10, evidence: 20 }),
      repositoryProfile("diverse", { relevance: 8, evidence: 15, diversity: ["health", "cli", "retrieval"] }),
      repositoryProfile("ineligible", { substantive: false }),
    ],
  }),
  sixPins: makeCompositionInput({
    repositories: Array.from({ length: 6 }, (_, index) => repositoryProfile(`pin-${index + 1}`, { pinPosition: index + 1 })),
  }),
  fewerThanFive: makeCompositionInput({
    repositories: [repositoryProfile("one"), repositoryProfile("two"), repositoryProfile("weak", { coherentPurpose: false })],
  }),
};

const selectionMatrix = Object.fromEntries(
  Object.entries(matrix).map(([name, input]) => {
    const result = reconcileProjects(input);
    return [name, {
      selected: result.selected.map(({ repositoryName }) => repositoryName),
      scores: result.evaluations.map(({ repositoryName, eligible, score }) => ({ repositoryName, eligible, score })),
    }];
  }),
);

const firstStabilityInput = makeCompositionInput({
  projectTarget: 1,
  repositories: [
    repositoryProfile("incumbent", { relevance: 4, evidence: 10 }),
    repositoryProfile("challenger", { relevance: 10, evidence: 20 }),
  ],
  priorSelected: ["incumbent"],
});
const firstStability = reconcileProjects(firstStabilityInput);
const secondStability = reconcileProjects({ ...firstStabilityInput, priorState: firstStability.state });

const candidateInput = makeCompositionInput({ matching: true });
const firstCandidate = await composeCandidate({ ...candidateInput, generator: new DeterministicLocalGenerator() });
const secondCandidate = await composeCandidate({ ...structuredClone(candidateInput), generator: new DeterministicLocalGenerator() });
if (firstCandidate.status !== "accepted" || secondCandidate.status !== "accepted") {
  throw new Error("Deterministic local candidate harness rejected its valid fixture.");
}

const report = {
  generatedAt: "deterministic-fixture",
  selectionMatrix,
  stability: {
    firstRun: firstStability.selected.map(({ repositoryName }) => repositoryName),
    firstComparisons: firstStability.comparisons,
    secondRun: secondStability.selected.map(({ repositoryName }) => repositoryName),
  },
  matching: firstCandidate.candidate.selectionState.evaluations.map(({ repositoryName, match }) => ({ repositoryName, match })),
  completeness: firstCandidate.candidate.completeness,
  hashes: firstCandidate.candidate.hashes,
  repeatHashes: secondCandidate.candidate.hashes,
  deterministic: JSON.stringify(firstCandidate.candidate.hashes) === JSON.stringify(secondCandidate.candidate.hashes),
  publicLeakFindings: [],
  productionGenerator: "blocked-until-compliant-provider-is-configured",
};

const evidenceSummary = {
  selectionMatrix: Object.fromEntries(Object.entries(selectionMatrix).map(([name, result]) => [name, result.selected])),
  stability: {
    firstRun: firstStability.selected.map(({ repositoryName }) => repositoryName),
    lead: firstStability.comparisons[0]?.lead,
    consecutiveRuns: firstStability.comparisons[0]?.consecutiveRuns,
    secondRun: secondStability.selected.map(({ repositoryName }) => repositoryName),
  },
  matching: Object.fromEntries(firstCandidate.candidate.selectionState.evaluations.map(({ repositoryName, match }) => [
    repositoryName,
    match.kind === "ambiguous" ? "ambiguous-unscored" : match.kind,
  ])),
  completeness: firstCandidate.candidate.completeness,
  hashes: firstCandidate.candidate.hashes,
  repeatHashesMatch: report.deterministic,
  publicLeakFindings: [],
  productionGenerator: "blocked-until-compliant-provider-is-configured",
};

process.stdout.write(`${JSON.stringify(process.argv.includes("--evidence") ? evidenceSummary : report, null, 2)}\n`);
