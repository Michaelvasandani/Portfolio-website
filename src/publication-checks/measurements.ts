import { z } from "zod";

const n = z.number().finite();
const b = z.boolean();

export const measurementSchemas = {
  "candidate-identity": z.strictObject({ candidateHashMatches: b, manifestHashMatches: b, publicOutputHashMatches: b }),
  "manifest-hash": z.strictObject({ manifestFieldsBound: b }),
  provenance: z.strictObject({ orphanFacts: n, unknownEvidenceReferences: n, alteredVerbatimValues: n }),
  completeness: z.strictObject({ missingSections: n, missingEntities: n, sourceOrderMatches: b }),
  "public-projection": z.strictObject({ allowlistedFieldsOnly: b, publicManifestHashOnly: b }),
  "privacy-leak": z.strictObject({ htmlLeaks: n, jsonLeaks: n, scriptLeaks: n, sourceMapLeaks: n, headerLeaks: n, pdfLeaks: n, imageMetadataLeaks: n, downloadLeaks: n }),
  "generated-copy": z.strictObject({ cardProofWords: n, aboutWords: n, projectDescriptionWords: n, projectDescriptionSentences: n, unsupportedClaims: n }),
  accessibility: z.strictObject({ violations: n, normalTextContrast: n, largeTextContrast: n, uiContrast: n, targetSize: n, zoomPercent: n }),
  responsive: z.strictObject({ browserViewportCombinations: n, horizontalOverflow: n, overlaps: n, clippedItems: n, readingOrderMatches: b, textSpacing: b, forcedColors: b, reducedMotion: b }),
  performance: z.strictObject({ runs: n, medianScore: n, minimumScore: n, medianFcpMs: n, medianSpeedIndexMs: n, medianLcpMs: n, medianTbtMs: n, medianCls: n, maximumFcpMs: n, maximumSpeedIndexMs: n, maximumLcpMs: n, maximumTbtMs: n, maximumCls: n, compressedJavaScriptBytes: n, initialTransferBytes: n, lcpRegressionPercent: n, lcpRegressionMs: n, tbtRegressionPercent: n, tbtRegressionMs: n, transferRegressionPercent: n, transferRegressionBytes: n }),
  seo: z.strictObject({ successful: b, indexable: b, titleCount: n, descriptionCount: n, h1Count: n, absoluteSelfCanonical: b, robotsValid: b, sitemapValid: b, openGraphComplete: b, duplicateIds: n }),
  "structured-data": z.strictObject({ valid: b, typesAllowlisted: b, factsAllowlisted: b }),
  links: z.strictObject({ internalRedirects: n, maximumRedirects: n, attempts: n, methodOrder: z.string(), malformed: n, downgrades: n, identityMismatches: n, confirmedNotFound: n, mailtoAllowlisted: b, transientThirdParty: b }),
  assets: z.strictObject({ missing: n, wrongStatus: n, wrongHost: n, wrongContentType: n, hashMismatches: n }),
  "public-resume": z.strictObject({ htmlGatesPass: b, contentMatches: b, sourceOrderMatches: b }),
  "pdf-ua": z.strictObject({ selectableText: b, title: b, language: b, tagged: b, readingOrder: b, tabOrder: b, headingsAndLists: b, linkAnnotations: b, embeddedFonts: b, clippedOrMissing: n, validatorFailures: n }),
  "checker-integrity": z.strictObject({ versionsPinned: b, rulesPinned: b, environmentPinned: b, configurationPinned: b, retryMaximum: n, priorResultsReused: b }),
  "subjective-visual": z.strictObject({ acceptedBaseline: b }),
  "content-screenshot": z.strictObject({ contentDrivenDifferences: n }),
  "field-performance": z.strictObject({ fieldDataPresent: b, p75LcpMs: n, p75InpMs: n, p75Cls: n }),
} as const;

export type CheckerMeasurements = {
  [K in keyof typeof measurementSchemas]: z.infer<(typeof measurementSchemas)[K]>;
};
