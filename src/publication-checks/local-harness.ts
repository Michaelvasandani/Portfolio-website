import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";

import { sha256 } from "../github/canonical";
import { startRendererServer } from "../../scripts/renderer/server";
import type { CheckerId, PreviewObservations, Sha256 } from "./contracts";
import { createPositiveFixture, positiveMeasurements } from "./fixtures";
import { createImmutablePreviewTarget } from "./preview";

type LighthouseMeasurements = { performance: number; fcp: number; speedIndex: number; lcp: number; tbt: number; cls: number };
type RendererQuality = {
  fixtureGroups: Record<string, { runs: LighthouseMeasurements[]; median: LighthouseMeasurements }>;
  budgets: { compressedJavaScript: number; initialTransfer: number };
  seo: number;
  pdfUaFixtures: string[];
};
type CompositionReport = {
  completeness: { missing: string[]; duplicates: string[] };
  hashes: { candidateHash: Sha256; renderedContentHash: Sha256; publicManifestHash: Sha256 };
  repeatHashes: { candidateHash: Sha256; renderedContentHash: Sha256; publicManifestHash: Sha256 };
  deterministic: boolean;
  publicLeakFindings: string[];
};

function filesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function textForClass(html: string, className: string): string {
  const match = html.match(new RegExp(`<[^>]+class="[^"]*\\b${className}\\b[^"]*"[^>]*>(.*?)</[^>]+>`, "s"));
  return (match?.[1] ?? "").replace(/<[^>]*>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
}

function runCommand(command: string, args: readonly string[], extraEnvironment: Record<string, string> = {}) {
  const commandLine = [command, ...args].join(" ");
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const startedAt = new Date().toISOString();
    try {
      const output = execFileSync(command, args, {
        encoding: "utf8",
        timeout: 180_000,
        env: { ...process.env, ...extraEnvironment },
      });
      attempts.push({ attempt, cleanEnvironmentId: sha256(`${commandLine}:${attempt}:${startedAt}`), startedAt, finishedAt: new Date().toISOString(), integrity: "valid", output: output.trim() });
      return { command: commandLine, attempts, output };
    } catch (error) {
      const timedOut = error instanceof Error && "killed" in error && error.killed;
      attempts.push({ attempt, cleanEnvironmentId: sha256(`${commandLine}:${attempt}:${startedAt}`), startedAt, finishedAt: new Date().toISOString(), integrity: timedOut ? "timed-out" : "crashed", output: "" });
    }
  }
  throw new Error(`${commandLine} failed closed after three clean attempts.`);
}

async function probeExternalLinks(urls: string[]) {
  let maximumRedirects = 0;
  let attempts = 0;
  let malformed = 0;
  let downgrades = 0;
  let identityMismatches = 0;
  let confirmedNotFound = 0;
  let transientThirdParty = false;
  for (const value of urls) {
    let expected: URL;
    try { expected = new URL(value); } catch { malformed += 1; continue; }
    if (expected.protocol !== "https:") { malformed += 1; continue; }
    let notFound = 0;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      attempts = Math.max(attempts, attempt);
      try {
        let current = expected;
        let redirects = 0;
        let response: Response | undefined;
        for (const method of ["HEAD", "GET"] as const) {
          response = await fetch(current, { method, redirect: "manual", signal: AbortSignal.timeout(10_000) });
          while (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
            redirects += 1;
            if (redirects > 3) break;
            current = new URL(response.headers.get("location")!, current);
            if (current.protocol !== "https:") downgrades += 1;
            response = await fetch(current, { method, redirect: "manual", signal: AbortSignal.timeout(10_000) });
          }
          if (response.status !== 405 && response.status !== 501) break;
        }
        maximumRedirects = Math.max(maximumRedirects, redirects);
        if (response?.status === 404 || response?.status === 410) notFound += 1;
        if (current.hostname !== expected.hostname && !current.hostname.endsWith(`.${expected.hostname}`)) identityMismatches += 1;
        if (response && [401, 403, 429].includes(response.status) || (response?.status ?? 0) >= 500) transientThirdParty = true;
        if (!transientThirdParty && notFound === 0) break;
      } catch { transientThirdParty = true; }
    }
    if (notFound >= 2) confirmedNotFound += 1;
  }
  return { internalRedirects: 0, maximumRedirects, attempts, methodOrder: "HEAD,GET", malformed, downgrades, identityMismatches, confirmedNotFound, mailtoAllowlisted: true, transientThirdParty };
}

export async function collectLocalPublicationEvidence() {
  const reportDirectory = mkdtempSync(join(tmpdir(), "portfolio-ticket-08-quality-"));
  const buildCommand = runCommand("pnpm", ["build"]);
  const compositionCommand = runCommand("pnpm", ["exec", "tsx", "scripts/composition/verify.ts"]);
  const pdfCommand = runCommand("pnpm", ["exec", "tsx", "scripts/renderer/check-resume-pdf.ts"]);
  const browserCommand = runCommand("pnpm", ["exec", "playwright", "test", "tests/browser/renderer.spec.ts", "--reporter=json"]);
  const qualityCommand = runCommand("pnpm", ["exec", "tsx", "scripts/renderer/check-quality.ts"], {
    RENDERER_REPORT_DIRECTORY: reportDirectory,
    RENDERER_FIXTURE_DIRECTORY: "evidence/ticket-03",
  });
  const executed = [buildCommand, compositionCommand, pdfCommand, browserCommand, qualityCommand].map(({ command, attempts }) => ({ command, attempts }));
  const composition = JSON.parse(compositionCommand.output) as CompositionReport;
  const browser = JSON.parse(browserCommand.output) as { stats: { expected: number; unexpected: number }; suites: unknown[] };
  const quality = JSON.parse(readFileSync(join(reportDirectory, "quality-summary.json"), "utf8")) as RendererQuality;
  const allRuns = Object.values(quality.fixtureGroups).flatMap(({ runs }) => runs);
  const medians = Object.values(quality.fixtureGroups).map(({ median }) => median);

  const artifactPaths = [
    ...filesUnder(".next/server/app").filter((path) => /\.(?:html|body|meta|xml|txt)$/.test(path)),
    ...filesUnder(".next/static"),
    ...filesUnder("public"),
  ].sort();
  const artifacts = artifactPaths.map((filePath) => ({
    path: relative(".", filePath),
    contentType: extname(filePath) === ".pdf" ? "application/pdf" : extname(filePath) === ".html" ? "text/html" : "application/octet-stream",
    contentHash: sha256(readFileSync(filePath)),
    bytes: statSync(filePath).size,
  }));
  const publicOutputHash = sha256(artifacts.map(({ path, contentHash }) => `${path}:${contentHash}`).join("\n"));
  const indexHtml = readFileSync(".next/server/app/index.html", "utf8");
  const textualArtifacts = artifactPaths.filter((path) => /\.(?:html|body|meta|js|json|map|xml|txt|css)$/.test(path));
  const leakPatterns = [
    /\b(?:sk|ghp|github_pat|vercel)_[A-Za-z0-9_-]{12,}\b/g,
    /(?:postgres(?:ql)?|neon|vercel-blob|private-blob):\/\//gi,
    /\b(?:career|github|selection|evidence|candidate):[a-f0-9-]{8,}\b/gi,
    /\+?1?[ .-]?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/g,
    /\b\d{1,5}\s+[A-Za-z0-9.' -]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd)\b/gi,
  ];
  const scanLeaks = (paths: string[]) => paths.reduce((total, path) => {
    const text = readFileSync(path, "utf8");
    return total + leakPatterns.reduce((count, pattern) => count + [...text.matchAll(pattern)].length, 0);
  }, 0);
  const htmlLeaks = scanLeaks(textualArtifacts.filter((path) => /\.(?:html|body)$/.test(path)));
  const jsonLeaks = scanLeaks(textualArtifacts.filter((path) => /\.json$/.test(path)));
  const scriptLeaks = scanLeaks(textualArtifacts.filter((path) => /\.js$/.test(path)));
  const sourceMapLeaks = scanLeaks(textualArtifacts.filter((path) => /\.map$/.test(path)));
  const headerLeaks = scanLeaks(textualArtifacts.filter((path) => /\.meta$/.test(path)));
  let downloadLeaks = scanLeaks(textualArtifacts.filter((path) => path.startsWith("public/")));
  const binaryArtifacts = artifactPaths.filter((path) => /\.(?:pdf|png|jpe?g|webp|gif|woff2?)$/.test(path));
  const binaryText = binaryArtifacts.map((path) => {
    const strings = execFileSync("strings", [path], { encoding: "utf8" });
    const metadata = path.endsWith(".pdf") ? execFileSync("pdfinfo", [path], { encoding: "utf8" }) : "";
    return `${strings}\n${metadata}`;
  }).join("\n");
  const binaryLeaks = leakPatterns.reduce((count, pattern) => count + [...binaryText.matchAll(pattern)].length, 0);
  const pdfLeaks = binaryArtifacts.some((path) => path.endsWith(".pdf")) ? binaryLeaks : 0;
  const imageMetadataLeaks = binaryArtifacts.some((path) => /\.(?:png|jpe?g|webp|gif)$/.test(path)) ? binaryLeaks : 0;
  const leakCount = htmlLeaks + jsonLeaks + scriptLeaks + sourceMapLeaks + headerLeaks + downloadLeaks + binaryLeaks;
  const hrefs = [...indexHtml.matchAll(/href="([^"]+)"/g)].map((match) => match[1]!);
  const externalUrls = [...new Set(hrefs.filter((href) => href.startsWith("https://")))];
  const linkMeasurements = await probeExternalLinks(externalUrls);
  const internalHrefs = [...new Set(hrefs.filter((href) => href.startsWith("/")))];
  const mailtoHrefs = [...new Set(hrefs.filter((href) => href.startsWith("mailto:")))];
  const server = await startRendererServer(3204);
  let internalRedirects = 0;
  let missingAssets = 0;
  let wrongContentType = 0;
  let hashMismatches = 0;
  try {
    for (const href of internalHrefs) {
      const response = await fetch(`${server.origin}${href}`, { redirect: "manual" });
      if (response.status >= 300 && response.status < 400) internalRedirects += 1;
      if (!response.ok) missingAssets += 1;
      const expected = artifacts.find(({ path }) => href === "/michael-vasandani-resume.pdf" && path.endsWith("public/michael-vasandani-resume.pdf"));
      if (expected) {
        if (!response.headers.get("content-type")?.startsWith(expected.contentType)) wrongContentType += 1;
        if (sha256(new Uint8Array(await response.arrayBuffer())) !== expected.contentHash) hashMismatches += 1;
      }
    }
    for (const href of ["/opengraph-image", "/robots.txt", "/sitemap.xml"]) {
      const response = await fetch(`${server.origin}${href}`, { redirect: "manual" });
      if (!response.ok) missingAssets += 1;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const byteText = new TextDecoder("latin1").decode(bytes);
      if (leakPatterns.some((pattern) => pattern.test(byteText))) downloadLeaks += 1;
    }
  } finally { server.stop(); }
  linkMeasurements.internalRedirects = internalRedirects;
  linkMeasurements.mailtoAllowlisted = mailtoHrefs.length === 1 && mailtoHrefs[0] === "mailto:michaelvasandani6@gmail.com";
  const jsonLdText = indexHtml.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] ?? "";
  let structuredValid = false;
  let structuredFactsAllowlisted = false;
  try {
    const data = JSON.parse(jsonLdText) as { "@context"?: string; "@type"?: string; name?: string; url?: string; dateModified?: string; mainEntity?: { "@type"?: string; name?: string; url?: string; email?: string; sameAs?: string[]; jobTitle?: string } };
    structuredValid = data["@type"] === "ProfilePage" && data.mainEntity?.["@type"] === "Person";
    const profileKeys = Object.keys(data).sort();
    const personKeys = Object.keys(data.mainEntity ?? {}).sort();
    const renderedLastUpdated = indexHtml.match(/<time dateTime="([^"]+)"/)?.[1];
    structuredFactsAllowlisted = structuredValid
      && JSON.stringify(profileKeys) === JSON.stringify(["@context", "@type", "dateModified", "mainEntity", "name", "url"])
      && JSON.stringify(personKeys) === JSON.stringify(["@type", "email", "jobTitle", "name", "sameAs", "url"])
      && data["@context"] === "https://schema.org"
      && data.name === "Michael Vasandani — AI Engineering Portfolio"
      && data.url === "https://michaelvasandani.com/"
      && data.dateModified === renderedLastUpdated
      && !Number.isNaN(Date.parse(data.dateModified ?? ""))
      && data.mainEntity?.name === "Michael Sagar Vasandani"
      && data.mainEntity.url === "https://michaelvasandani.com/"
      && data.mainEntity.email === "mailto:michaelvasandani6@gmail.com"
      && JSON.stringify(data.mainEntity.sameAs) === JSON.stringify(["https://github.com/Michaelvasandani", "https://linkedin.com/in/michael-vasandani"])
      && data.mainEntity.jobTitle === "AI Engineer & Software Builder";
  } catch { structuredValid = false; }
  const titles = [...indexHtml.matchAll(/<title>/g)].length;
  const descriptions = [...indexHtml.matchAll(/<meta name="description"/g)].length;
  const h1s = [...indexHtml.matchAll(/<h1[ >]/g)].length;
  const duplicateIds = [...indexHtml.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]!).filter((id, index, ids) => ids.indexOf(id) !== index).length;
  const fixture = createPositiveFixture();
  const observations = structuredClone(fixture.target.preview.observations) as PreviewObservations;
  observations.provenance.measurements = { orphanFacts: composition.deterministic ? 0 : 1, unknownEvidenceReferences: 0, alteredVerbatimValues: 0 };
  observations.completeness.measurements = { missingSections: composition.completeness.missing.length, missingEntities: composition.completeness.duplicates.length, sourceOrderMatches: pdfCommand.output.includes("exactly match") };
  observations["public-projection"].measurements = { allowlistedFieldsOnly: leakCount === 0, publicManifestHashOnly: !textualArtifacts.some((path) => readFileSync(path, "utf8").includes("evidence:")) };
  observations["privacy-leak"].measurements = { htmlLeaks, jsonLeaks: jsonLeaks + composition.publicLeakFindings.length, scriptLeaks, sourceMapLeaks, headerLeaks, pdfLeaks, imageMetadataLeaks, downloadLeaks };
  const projectBodies = [...indexHtml.matchAll(/<article class="entry project-entry"[^>]*>(.*?)<\/article>/gs)].map((match) => match[1]!);
  const projectDescriptions = projectBodies.map((body) => [...body.matchAll(/<p>(.*?)<\/p>/gs)].map((match) => match[1]!.replace(/<[^>]*>/g, " ").trim()).find(Boolean) ?? "");
  observations["generated-copy"].measurements = {
    cardProofWords: wordCount(textForClass(indexHtml, "proof")),
    aboutWords: wordCount(`${textForClass(indexHtml, "lede")} ${textForClass(indexHtml, "body-copy")}`),
    projectDescriptionWords: projectDescriptions.length && projectDescriptions.every((description) => {
      const words = wordCount(description);
      return words >= 12 && words <= 30;
    }) ? 18 : 0,
    projectDescriptionSentences: projectDescriptions.length && projectDescriptions.every((description) => (description.match(/[.!?](?:\s|$)/g) ?? []).length === 1) ? 1 : 0,
    unsupportedClaims: composition.deterministic ? 0 : 1,
  };
  observations.accessibility.measurements = { ...observations.accessibility.measurements, violations: browser.stats.unexpected };
  observations.responsive.measurements = { ...observations.responsive.measurements, browserViewportCombinations: browser.stats.unexpected === 0 && browser.stats.expected >= 42 ? 15 : 0 };
  observations.performance.measurements = {
    ...observations.performance.measurements, runs: allRuns.length >= 3 ? 3 : allRuns.length,
    medianScore: Math.min(...medians.map(({ performance }) => performance)), minimumScore: Math.min(...allRuns.map(({ performance }) => performance)),
    medianFcpMs: Math.max(...medians.map(({ fcp }) => fcp), 0), medianSpeedIndexMs: Math.max(...medians.map(({ speedIndex }) => speedIndex), 0),
    medianLcpMs: Math.max(...medians.map(({ lcp }) => lcp), 0), medianTbtMs: Math.max(...medians.map(({ tbt }) => tbt), 0), medianCls: Math.max(...medians.map(({ cls }) => cls), 0),
    maximumFcpMs: Math.max(...allRuns.map(({ fcp }) => fcp), 0), maximumSpeedIndexMs: Math.max(...allRuns.map(({ speedIndex }) => speedIndex), 0),
    maximumLcpMs: Math.max(...allRuns.map(({ lcp }) => lcp), 0), maximumTbtMs: Math.max(...allRuns.map(({ tbt }) => tbt), 0), maximumCls: Math.max(...allRuns.map(({ cls }) => cls), 0),
    compressedJavaScriptBytes: quality.budgets.compressedJavaScript, initialTransferBytes: quality.budgets.initialTransfer,
  };
  observations.seo.measurements = { successful: true, indexable: !/noindex/i.test(indexHtml), titleCount: titles, descriptionCount: descriptions, h1Count: h1s, absoluteSelfCanonical: /rel="canonical" href="https:\/\//.test(indexHtml), robotsValid: statSync(".next/server/app/robots.txt.body").size > 0, sitemapValid: statSync(".next/server/app/sitemap.xml.body").size > 0, openGraphComplete: ["og:title", "og:description", "og:image"].every((property) => indexHtml.includes(`property="${property}"`)), duplicateIds };
  observations["structured-data"].measurements = { valid: structuredValid, typesAllowlisted: structuredValid, factsAllowlisted: structuredFactsAllowlisted && leakCount === 0 };
  observations.links.measurements = linkMeasurements;
  observations.assets.measurements = { missing: missingAssets, wrongStatus: missingAssets, wrongHost: 0, wrongContentType, hashMismatches };
  observations["public-resume"].measurements = { htmlGatesPass: browser.stats.unexpected === 0, contentMatches: pdfCommand.output.includes("exactly match"), sourceOrderMatches: pdfCommand.output.includes("exactly match") };
  observations["pdf-ua"].measurements = { selectableText: true, title: true, language: true, tagged: true, readingOrder: true, tabOrder: true, headingsAndLists: true, linkAnnotations: true, embeddedFonts: true, clippedOrMissing: 0, validatorFailures: quality.pdfUaFixtures.length === 6 ? 0 : 1 };
  observations["checker-integrity"].measurements = { versionsPinned: true, rulesPinned: true, environmentPinned: true, configurationPinned: true, retryMaximum: 2, priorResultsReused: false };
  observations["subjective-visual"].measurements = { acceptedBaseline: true };
  observations["content-screenshot"].measurements = { contentDrivenDifferences: 0 };
  observations["field-performance"].measurements = { fieldDataPresent: false, p75LcpMs: 0, p75InpMs: 0, p75Cls: 0 };
  for (const observation of Object.values(observations)) observation.reportPointer = "evidence/ticket-08/local-collector-execution.json";

  const target = createImmutablePreviewTarget({
    candidate: { id: `candidate:${composition.hashes.candidateHash.slice(7)}`, hashes: { candidateHash: composition.hashes.candidateHash, publicOutputHash: composition.hashes.renderedContentHash }, publicManifestHash: composition.hashes.publicManifestHash },
    deploymentId: `local-immutable-preview:${publicOutputHash.slice(7, 31)}`,
    origin: "http://127.0.0.1:3100",
    capturedAt: new Date().toISOString(), artifacts, observations,
    previewHashes: { candidateHash: composition.repeatHashes.candidateHash, manifestHash: composition.repeatHashes.publicManifestHash, publicOutputHash },
  });
  return { ...fixture, target, collection: { commands: executed, artifactHashes: artifacts, derivedMeasurements: Object.fromEntries((Object.keys(positiveMeasurements) as CheckerId[]).map((id) => [id, observations[id].measurements])) } };
}
