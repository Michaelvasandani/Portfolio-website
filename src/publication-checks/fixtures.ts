import { sha256 } from "../github/canonical";
import { createObservationCheckers, publicationCheckInventory } from "./checkers";
import { mutableNormativeConfigurationFixture } from "./config";
import type { CheckOutcome, CheckerId, PreviewObservations } from "./contracts";
import { createImmutablePreviewTarget } from "./preview";

export const positiveMeasurements: Record<CheckerId, Record<string, string | number | boolean>> = {
  "candidate-identity": { candidateHashMatches: true, manifestHashMatches: true, publicOutputHashMatches: true },
  "manifest-hash": { manifestFieldsBound: true },
  provenance: { orphanFacts: 0, unknownEvidenceReferences: 0, alteredVerbatimValues: 0 },
  completeness: { missingSections: 0, missingEntities: 0, sourceOrderMatches: true },
  "public-projection": { allowlistedFieldsOnly: true, publicManifestHashOnly: true },
  "privacy-leak": { htmlLeaks: 0, jsonLeaks: 0, scriptLeaks: 0, sourceMapLeaks: 0, headerLeaks: 0, pdfLeaks: 0, imageMetadataLeaks: 0, downloadLeaks: 0 },
  "generated-copy": { cardProofWords: 18, aboutWords: 71, projectDescriptionWords: 18, projectDescriptionSentences: 1, unsupportedClaims: 0 },
  accessibility: { violations: 0, normalTextContrast: 4.8, largeTextContrast: 3.2, uiContrast: 3.1, targetSize: 44, zoomPercent: 200 },
  responsive: { browserViewportCombinations: 15, horizontalOverflow: 0, overlaps: 0, clippedItems: 0, readingOrderMatches: true, textSpacing: true, forcedColors: true, reducedMotion: true },
  performance: { runs: 3, medianScore: 100, minimumScore: 100, medianFcpMs: 210, medianSpeedIndexMs: 210, medianLcpMs: 560, medianTbtMs: 0, medianCls: 0, maximumFcpMs: 215, maximumSpeedIndexMs: 215, maximumLcpMs: 570, maximumTbtMs: 0, maximumCls: 0, compressedJavaScriptBytes: 129773, initialTransferBytes: 289713, lcpRegressionPercent: 0, lcpRegressionMs: 0, tbtRegressionPercent: 0, tbtRegressionMs: 0, transferRegressionPercent: 0, transferRegressionBytes: 0 },
  seo: { successful: true, indexable: true, titleCount: 1, descriptionCount: 1, h1Count: 1, absoluteSelfCanonical: true, robotsValid: true, sitemapValid: true, openGraphComplete: true, duplicateIds: 0 },
  "structured-data": { valid: true, typesAllowlisted: true, factsAllowlisted: true },
  links: { internalRedirects: 0, maximumRedirects: 3, attempts: 1, methodOrder: "HEAD,GET", malformed: 0, downgrades: 0, identityMismatches: 0, confirmedNotFound: 0, mailtoAllowlisted: true, transientThirdParty: false },
  assets: { missing: 0, wrongStatus: 0, wrongHost: 0, wrongContentType: 0, hashMismatches: 0 },
  "public-resume": { htmlGatesPass: true, contentMatches: true, sourceOrderMatches: true },
  "pdf-ua": { selectableText: true, title: true, language: true, tagged: true, readingOrder: true, tabOrder: true, headingsAndLists: true, linkAnnotations: true, embeddedFonts: true, clippedOrMissing: 0, validatorFailures: 0 },
  "checker-integrity": { versionsPinned: true, rulesPinned: true, environmentPinned: true, configurationPinned: true, retryMaximum: 2, priorResultsReused: false },
  "subjective-visual": { acceptedBaseline: true },
  "content-screenshot": { contentDrivenDifferences: 0 },
  "field-performance": { fieldDataPresent: true, p75LcpMs: 1800, p75InpMs: 120, p75Cls: 0.05 },
};

function observations(): PreviewObservations {
  return Object.fromEntries(publicationCheckInventory.map(({ id }) => [id, { measurements: positiveMeasurements[id] }])) as PreviewObservations;
}

export function createPositiveFixture() {
  const configuration = mutableNormativeConfigurationFixture();
  const candidateHash = sha256("ticket-08-candidate");
  const manifestHash = sha256("ticket-08-public-manifest");
  const publicOutputHash = sha256("ticket-08-public-output");
  const target = createImmutablePreviewTarget({
    candidate: { id: "candidate:ticket-08", hashes: { candidateHash, publicOutputHash }, publicManifestHash: manifestHash },
    deploymentId: "deployment:zero-traffic-ticket-08",
    origin: "https://ticket-08-preview.invalid",
    capturedAt: "2026-08-12T22:00:00.000Z",
    artifacts: [
      { path: "/", contentType: "text/html", contentHash: sha256("portfolio-html") },
      { path: "/resume", contentType: "text/html", contentHash: sha256("resume-html") },
      { path: "/michael-vasandani-resume.pdf", contentType: "application/pdf", contentHash: sha256("resume-pdf") },
    ],
    observations: observations(),
  });
  return {
    target,
    configuration,
    inventory: publicationCheckInventory,
    checkers: createObservationCheckers(),
    clock: { now: () => "2026-08-12T22:00:00.000Z" },
  };
}

const negativeCases: { requirement: string; name: string; checkId: CheckerId; expected: CheckOutcome }[] = [
  { requirement: "PUB-003", name: "preview hash mismatch", checkId: "candidate-identity", expected: "blocked" },
  { requirement: "QAL-001", name: "manifest mismatch", checkId: "manifest-hash", expected: "blocked" },
  { requirement: "QAL-001", name: "orphan fact", checkId: "provenance", expected: "blocked" },
  { requirement: "CNT-002/CNT-003/QAL-001", name: "missing résumé content", checkId: "completeness", expected: "blocked" },
  { requirement: "QAL-001", name: "non-allowlisted public field", checkId: "public-projection", expected: "blocked" },
  { requirement: "QAL-001", name: "private evidence identifier leak", checkId: "privacy-leak", expected: "blocked" },
  { requirement: "CNT-001/GEN-001", name: "unsupported generated claim", checkId: "generated-copy", expected: "blocked" },
  { requirement: "QAL-002", name: "automated accessibility violation", checkId: "accessibility", expected: "blocked" },
  { requirement: "PRD-003/QAL-002", name: "320px horizontal overflow", checkId: "responsive", expected: "blocked" },
  { requirement: "QAL-003", name: "Lighthouse threshold failure", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-004", name: "accidental noindex", checkId: "seo", expected: "blocked" },
  { requirement: "QAL-004", name: "non-allowlisted structured fact", checkId: "structured-data", expected: "blocked" },
  { requirement: "QAL-004", name: "confirmed external 404", checkId: "links", expected: "blocked" },
  { requirement: "QAL-004", name: "asset hash mismatch", checkId: "assets", expected: "blocked" },
  { requirement: "QAL-005", name: "résumé content-order mismatch", checkId: "public-resume", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF UA validator failure", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-006", name: "unpinned checker environment", checkId: "checker-integrity", expected: "blocked" },
  { requirement: "QAL-006", name: "subjective visual concern", checkId: "subjective-visual", expected: "warning" },
  { requirement: "QAL-002/QAL-006", name: "content-driven screenshot difference", checkId: "content-screenshot", expected: "warning" },
  { requirement: "QAL-003/QAL-006", name: "poor field performance", checkId: "field-performance", expected: "warning" },
  { requirement: "QAL-004/QAL-006", name: "transient third-party failure", checkId: "links", expected: "warning" },
  { requirement: "QAL-002", name: "normal contrast below 4.5", checkId: "accessibility", expected: "blocked" },
  { requirement: "QAL-002", name: "large contrast below 3", checkId: "accessibility", expected: "blocked" },
  { requirement: "QAL-002", name: "UI contrast below 3", checkId: "accessibility", expected: "blocked" },
  { requirement: "QAL-002", name: "target below 44px", checkId: "accessibility", expected: "blocked" },
  { requirement: "QAL-002", name: "zoom below 200 percent", checkId: "accessibility", expected: "blocked" },
  { requirement: "QAL-002", name: "browser viewport matrix incomplete", checkId: "responsive", expected: "blocked" },
  { requirement: "QAL-002", name: "text spacing failure", checkId: "responsive", expected: "blocked" },
  { requirement: "QAL-002", name: "forced colors failure", checkId: "responsive", expected: "blocked" },
  { requirement: "QAL-002", name: "reduced motion failure", checkId: "responsive", expected: "blocked" },
  { requirement: "QAL-003", name: "Lighthouse individual score below 85", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "FCP median above 1.8s", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "Speed Index median above 3.4s", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "LCP median above 2.5s", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "TBT median above 200ms", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "CLS median above 0.1", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "Lighthouse poor band", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "JavaScript above 150 KiB", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "transfer above 500 KiB", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "LCP dual-threshold regression", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "TBT dual-threshold regression", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-003", name: "transfer dual-threshold regression", checkId: "performance", expected: "blocked" },
  { requirement: "QAL-004", name: "external redirect limit exceeded", checkId: "links", expected: "blocked" },
  { requirement: "QAL-004", name: "HTTPS downgrade", checkId: "links", expected: "blocked" },
  { requirement: "QAL-004", name: "repository identity mismatch", checkId: "links", expected: "blocked" },
  { requirement: "QAL-004", name: "non-allowlisted mailto", checkId: "links", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF missing selectable text", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF missing title", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF missing language", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF untagged", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF reading order failure", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF tab order failure", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF headings and lists failure", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF link annotation failure", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF font not embedded", checkId: "pdf-ua", expected: "blocked" },
  { requirement: "QAL-005", name: "PDF content clipped", checkId: "pdf-ua", expected: "blocked" },
];

const negativeMeasurements: Record<string, Record<string, string | number | boolean>> = {
  "manifest mismatch": { manifestFieldsBound: false },
  "orphan fact": { orphanFacts: 1 },
  "missing résumé content": { missingEntities: 1 },
  "non-allowlisted public field": { allowlistedFieldsOnly: false },
  "private evidence identifier leak": { jsonLeaks: 1 },
  "unsupported generated claim": { unsupportedClaims: 1 },
  "automated accessibility violation": { violations: 1 },
  "320px horizontal overflow": { horizontalOverflow: 1 },
  "Lighthouse threshold failure": { medianScore: 89 },
  "accidental noindex": { indexable: false },
  "non-allowlisted structured fact": { factsAllowlisted: false },
  "confirmed external 404": { confirmedNotFound: 2, attempts: 2 },
  "asset hash mismatch": { hashMismatches: 1 },
  "résumé content-order mismatch": { sourceOrderMatches: false },
  "PDF UA validator failure": { validatorFailures: 1 },
  "unpinned checker environment": { environmentPinned: false },
  "subjective visual concern": { acceptedBaseline: false },
  "content-driven screenshot difference": { contentDrivenDifferences: 1 },
  "poor field performance": { p75LcpMs: 2600 },
  "transient third-party failure": { transientThirdParty: true, attempts: 3 },
  "normal contrast below 4.5": { normalTextContrast: 4.49 },
  "large contrast below 3": { largeTextContrast: 2.99 },
  "UI contrast below 3": { uiContrast: 2.99 },
  "target below 44px": { targetSize: 43.99 },
  "zoom below 200 percent": { zoomPercent: 199 },
  "browser viewport matrix incomplete": { browserViewportCombinations: 14 },
  "text spacing failure": { textSpacing: false },
  "forced colors failure": { forcedColors: false },
  "reduced motion failure": { reducedMotion: false },
  "Lighthouse individual score below 85": { minimumScore: 84 },
  "FCP median above 1.8s": { medianFcpMs: 1801 },
  "Speed Index median above 3.4s": { medianSpeedIndexMs: 3401 },
  "LCP median above 2.5s": { medianLcpMs: 2501 },
  "TBT median above 200ms": { medianTbtMs: 201 },
  "CLS median above 0.1": { medianCls: 0.101 },
  "Lighthouse poor band": { maximumLcpMs: 4000 },
  "JavaScript above 150 KiB": { compressedJavaScriptBytes: 153601 },
  "transfer above 500 KiB": { initialTransferBytes: 512001 },
  "LCP dual-threshold regression": { lcpRegressionPercent: 10.1, lcpRegressionMs: 101 },
  "TBT dual-threshold regression": { tbtRegressionPercent: 10.1, tbtRegressionMs: 101 },
  "transfer dual-threshold regression": { transferRegressionPercent: 10.1, transferRegressionBytes: 25601 },
  "external redirect limit exceeded": { maximumRedirects: 4 },
  "HTTPS downgrade": { downgrades: 1, transientThirdParty: true, attempts: 3 },
  "repository identity mismatch": { identityMismatches: 1, transientThirdParty: true, attempts: 3 },
  "non-allowlisted mailto": { mailtoAllowlisted: false },
  "PDF missing selectable text": { selectableText: false },
  "PDF missing title": { title: false },
  "PDF missing language": { language: false },
  "PDF untagged": { tagged: false },
  "PDF reading order failure": { readingOrder: false },
  "PDF tab order failure": { tabOrder: false },
  "PDF headings and lists failure": { headingsAndLists: false },
  "PDF link annotation failure": { linkAnnotations: false },
  "PDF font not embedded": { embeddedFonts: false },
  "PDF content clipped": { clippedOrMissing: 1 },
};

export function createFixtureMatrix() {
  return negativeCases.map((entry) => {
    const fixture = createPositiveFixture();
    const mutable = structuredClone(fixture.target.preview.observations) as Record<CheckerId, { measurements: Record<string, string | number | boolean>; reason?: string }>;
    mutable[entry.checkId] = {
      measurements: { ...mutable[entry.checkId].measurements, ...negativeMeasurements[entry.name] },
      reason: entry.name,
    };
    const target = createImmutablePreviewTarget({
      candidate: fixture.target.candidate,
      deploymentId: fixture.target.preview.deploymentId,
      origin: fixture.target.preview.origin,
      capturedAt: fixture.target.preview.capturedAt,
      artifacts: fixture.target.preview.artifacts,
      observations: mutable as PreviewObservations,
      ...(entry.name === "preview hash mismatch" ? { previewHashes: { publicOutputHash: sha256("wrong") } } : {}),
    });
    const checkers = createObservationCheckers();
    return { ...entry, fixture: { ...fixture, target, checkers } };
  });
}
