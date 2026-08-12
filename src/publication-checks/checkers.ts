import type { CheckerDefinition, CheckerId, CheckOutcome, ImmutablePreviewTarget, NormativeConfiguration, PublicationChecker } from "./contracts";
import { measurementSchemas } from "./measurements";
import { immutableTargetIdentity } from "./preview";

const requirements: Record<CheckerId, string> = {
  "candidate-identity": "PUB-003", "manifest-hash": "QAL-001", provenance: "QAL-001",
  completeness: "CNT-002,CNT-003,QAL-001", "public-projection": "QAL-001", "privacy-leak": "QAL-001",
  "generated-copy": "CNT-001,GEN-001", accessibility: "QAL-002", responsive: "PRD-003,QAL-002",
  performance: "QAL-003", seo: "QAL-004", "structured-data": "QAL-004", links: "QAL-004", assets: "QAL-004",
  "public-resume": "QAL-005", "pdf-ua": "QAL-005", "checker-integrity": "QAL-006", "subjective-visual": "QAL-006",
  "content-screenshot": "QAL-002,QAL-006", "field-performance": "QAL-003,QAL-006",
};

const definitions: CheckerDefinition[] = configurationFile.checkers.map((checker) => ({
  ...checker,
  id: checker.id as CheckerId,
  requirement: requirements[checker.id as CheckerId],
  classification: checker.classification as "blocking" | "warning",
  contradicts: [],
}));

export const publicationCheckInventory = definitions;

const number = (values: Record<string, string | number | boolean>, key: string) => values[key] as number;
const bool = (values: Record<string, string | number | boolean>, key: string) => values[key] === true;

function evaluatedOutcome(
  definition: CheckerDefinition,
  target: ImmutablePreviewTarget,
  configuration: NormativeConfiguration,
): CheckOutcome {
  const observation = target.preview.observations[definition.id];
  if (!observation) return "blocked";
  const value = observation.measurements as Record<string, string | number | boolean>;
  const performance = configuration.thresholds.performance;
  let passed = false;
  switch (definition.id) {
    case "candidate-identity": passed = target.preview.candidateHash === target.candidate.hashes.candidateHash && target.preview.manifestHash === target.candidate.publicManifestHash && target.preview.publicOutputHash === target.candidate.hashes.publicOutputHash; break;
    case "manifest-hash": passed = bool(value, "manifestFieldsBound"); break;
    case "provenance": passed = number(value, "orphanFacts") === 0 && number(value, "unknownEvidenceReferences") === 0 && number(value, "alteredVerbatimValues") === 0; break;
    case "completeness": passed = number(value, "missingSections") === 0 && number(value, "missingEntities") === 0 && bool(value, "sourceOrderMatches"); break;
    case "public-projection": passed = bool(value, "allowlistedFieldsOnly") && bool(value, "publicManifestHashOnly"); break;
    case "privacy-leak": passed = ["htmlLeaks", "jsonLeaks", "scriptLeaks", "sourceMapLeaks", "headerLeaks", "pdfLeaks", "imageMetadataLeaks", "downloadLeaks"]
      .every((key) => number(value, key) === 0); break;
    case "generated-copy": {
      const bounds = configuration.thresholds.generatedCopy;
      const card = bounds.cardProofWords as number[];
      const project = bounds.projectDescriptionWords as number[];
      passed = number(value, "cardProofWords") >= card[0]! && number(value, "cardProofWords") <= card[1]!
        && number(value, "aboutWords") <= bounds.aboutMaximumWords
        && number(value, "projectDescriptionWords") >= project[0]! && number(value, "projectDescriptionWords") <= project[1]!
        && number(value, "projectDescriptionSentences") === bounds.projectDescriptionSentences
        && number(value, "unsupportedClaims") === 0;
      break;
    }
    case "accessibility": passed = number(value, "violations") === 0
      && number(value, "normalTextContrast") >= Number(configuration.accessibility.normalTextContrast)
      && number(value, "largeTextContrast") >= Number(configuration.accessibility.largeTextContrast)
      && number(value, "uiContrast") >= Number(configuration.accessibility.uiContrast)
      && number(value, "targetSize") >= Number(configuration.accessibility.targetSizeCssPixels)
      && number(value, "zoomPercent") === Number(configuration.accessibility.zoomPercent); break;
    case "responsive": passed = number(value, "browserViewportCombinations") === configuration.viewports.length * (configuration.environment.browsers as unknown[]).length
      && number(value, "horizontalOverflow") === 0 && number(value, "overlaps") === 0 && number(value, "clippedItems") === 0
      && bool(value, "readingOrderMatches") && bool(value, "textSpacing") && bool(value, "forcedColors") && bool(value, "reducedMotion"); break;
    case "performance": {
      const regresses = (prefix: "lcp" | "tbt" | "transfer", tolerance: number) =>
        number(value, `${prefix}RegressionPercent`) > performance.regressionPercent
        && number(value, `${prefix}Regression${prefix === "transfer" ? "Bytes" : "Ms"}`) > tolerance;
      passed = number(value, "runs") === performance.runs
        && number(value, "medianScore") >= performance.minimumMedianScore && number(value, "minimumScore") >= performance.minimumRunScore
        && number(value, "medianFcpMs") <= performance.medianFcpMs && number(value, "medianSpeedIndexMs") <= performance.medianSpeedIndexMs
        && number(value, "medianLcpMs") <= performance.medianLcpMs && number(value, "medianTbtMs") <= performance.medianTbtMs && number(value, "medianCls") <= performance.medianCls
        && number(value, "maximumFcpMs") < performance.poorFcpMs && number(value, "maximumSpeedIndexMs") < performance.poorSpeedIndexMs
        && number(value, "maximumLcpMs") < performance.poorLcpMs && number(value, "maximumTbtMs") < performance.poorTbtMs && number(value, "maximumCls") <= performance.poorCls
        && number(value, "compressedJavaScriptBytes") <= performance.compressedInitialJavaScriptBytes
        && number(value, "initialTransferBytes") <= performance.totalInitialTransferBytes
        && !regresses("lcp", performance.timingMaterialToleranceMs) && !regresses("tbt", performance.timingMaterialToleranceMs)
        && !regresses("transfer", performance.transferMaterialToleranceBytes);
      break;
    }
    case "seo": passed = bool(value, "successful") && bool(value, "indexable") && number(value, "titleCount") === 1 && number(value, "descriptionCount") === 1 && number(value, "h1Count") === 1 && bool(value, "absoluteSelfCanonical") && bool(value, "robotsValid") && bool(value, "sitemapValid") && bool(value, "openGraphComplete") && number(value, "duplicateIds") === 0; break;
    case "structured-data": passed = bool(value, "valid") && bool(value, "typesAllowlisted") && bool(value, "factsAllowlisted"); break;
    case "links": {
      const objectivePassed = number(value, "internalRedirects") === 0 && number(value, "maximumRedirects") <= Number(configuration.thresholds.externalLinks.maximumRedirects)
        && String(value.methodOrder) === (configuration.thresholds.externalLinks.methodOrder as string[]).join(",")
        && number(value, "malformed") === 0 && number(value, "downgrades") === 0 && number(value, "identityMismatches") === 0
        && number(value, "confirmedNotFound") < Number(configuration.thresholds.externalLinks.confirmedNotFoundAttempts) && bool(value, "mailtoAllowlisted");
      if (!objectivePassed) return "blocked";
      if (bool(value, "transientThirdParty") && number(value, "attempts") === Number(configuration.thresholds.externalLinks.maximumAttempts)) return "warning";
      passed = true;
      break;
    }
    case "assets": passed = number(value, "missing") === 0 && number(value, "wrongStatus") === 0 && number(value, "wrongHost") === 0 && number(value, "wrongContentType") === 0 && number(value, "hashMismatches") === 0; break;
    case "public-resume": passed = bool(value, "htmlGatesPass") && bool(value, "contentMatches") && bool(value, "sourceOrderMatches"); break;
    case "pdf-ua": passed = bool(value, "selectableText") && bool(value, "title") && bool(value, "language") && bool(value, "tagged") && bool(value, "readingOrder") && bool(value, "tabOrder") && bool(value, "headingsAndLists") && bool(value, "linkAnnotations") && bool(value, "embeddedFonts") && number(value, "clippedOrMissing") === 0 && number(value, "validatorFailures") === 0; break;
    case "checker-integrity": passed = bool(value, "versionsPinned") && bool(value, "rulesPinned") && bool(value, "environmentPinned") && bool(value, "configurationPinned") && number(value, "retryMaximum") === configuration.retry.maximumRetries && !bool(value, "priorResultsReused"); break;
    case "subjective-visual": passed = bool(value, "acceptedBaseline"); break;
    case "content-screenshot": passed = number(value, "contentDrivenDifferences") === 0; break;
    case "field-performance": passed = bool(value, "fieldDataPresent") && number(value, "p75LcpMs") <= 2500 && number(value, "p75InpMs") <= 200 && number(value, "p75Cls") <= .1; break;
  }
  return passed ? "passed" : definition.classification === "warning" ? "warning" : "blocked";
}

export function createObservationCheckers(): PublicationChecker[] {
  return definitions.map((definition) => ({
    definition,
    createAttempt: () => ({ run: async (target, context) => {
      const observation = target.preview.observations[definition.id];
      const targetIdentity = immutableTargetIdentity(target);
      if (!observation) return { integrity: "missing", measurements: {}, reportPointer: null, targetIdentity };
      const parsed = measurementSchemas[definition.id].safeParse(observation.measurements);
      if (!parsed.success) return { integrity: "contradictory", measurements: {}, reportPointer: null, targetIdentity };
      const measurements = definition.id === "candidate-identity" ? {
        candidateHashMatches: target.preview.candidateHash === target.candidate.hashes.candidateHash,
        manifestHashMatches: target.preview.manifestHash === target.candidate.publicManifestHash,
        publicOutputHashMatches: target.preview.publicOutputHash === target.candidate.hashes.publicOutputHash,
      } : observation.measurements;
      return {
        integrity: "valid",
        outcome: evaluatedOutcome(definition, target, context.configuration),
        measurements,
        reportPointer: observation.reportPointer ?? `fixture://publication-checks/${definition.id}`,
        targetIdentity,
      };
    } }),
  }));
}
import configurationFile from "../../config/publication-checks.v1.json";
