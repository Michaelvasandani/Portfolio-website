import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { platform, release } from "node:os";
import { gzipSync } from "node:zlib";

import { fixtureNames, type RendererFixtureName } from "../../src/renderer/fixtures";
import { startRendererServer } from "./server";

const reportDirectory = process.env.RENDERER_REPORT_DIRECTORY ?? "evidence/ticket-03";
const fixtureDirectory = process.env.RENDERER_FIXTURE_DIRECTORY ?? "evidence/ticket-03";
mkdirSync(reportDirectory, { recursive: true });
const server = await startRendererServer(3201);
const { origin } = server;

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
}

try {
  const allRuns: Record<string, unknown>[] = [];
  for (const fixture of ["sparse", "dense"]) {
    for (let run = 1; run <= 3; run += 1) {
      const outputPath = `${reportDirectory}/lighthouse-${fixture}-${run}.json`;
      execFileSync("pnpm", ["exec", "lighthouse", `${origin}/renderer-fixtures/${fixture}`, "--quiet", "--chrome-flags=--headless --no-sandbox", "--throttling-method=simulate", "--throttling.rttMs=40", "--throttling.throughputKbps=10240", "--throttling.cpuSlowdownMultiplier=2", "--only-categories=performance,accessibility", "--output=json", `--output-path=${outputPath}`], { stdio: "inherit" });
      allRuns.push(JSON.parse(readFileSync(outputPath, "utf8")) as Record<string, unknown>);
    }
  }

  const metrics = allRuns.map((run) => {
    const categories = run.categories as Record<string, { score: number }>;
    const audits = run.audits as Record<string, { numericValue: number }>;
    return {
      performance: categories.performance!.score * 100,
      accessibility: categories.accessibility!.score * 100,
      fcp: audits["first-contentful-paint"]!.numericValue,
      speedIndex: audits["speed-index"]!.numericValue,
      lcp: audits["largest-contentful-paint"]!.numericValue,
      tbt: audits["total-blocking-time"]!.numericValue,
      cls: audits["cumulative-layout-shift"]!.numericValue,
    };
  });

  function summarizeFixtureRuns(index: number) {
    const runs = metrics.slice(index * 3, index * 3 + 3);
    return {
      runs,
      median: {
        performance: median(runs.map(({ performance }) => performance)),
        fcp: median(runs.map(({ fcp }) => fcp)),
        speedIndex: median(runs.map(({ speedIndex }) => speedIndex)),
        lcp: median(runs.map(({ lcp }) => lcp)),
        tbt: median(runs.map(({ tbt }) => tbt)),
        cls: median(runs.map(({ cls }) => cls)),
      },
    };
  }
  const fixtureGroups = {
    sparse: summarizeFixtureRuns(0),
    dense: summarizeFixtureRuns(1),
  };

  const summary = {
    checker: "lighthouse",
    version: "13.4.1",
    environment: {
      node: process.version,
      operatingSystem: `${platform()} ${release()}`,
      chrome: (allRuns[0] as { environment: { hostUserAgent: string } }).environment.hostUserAgent,
      formFactor: "mobile",
      throttlingMethod: "simulate",
      throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 2 },
      coldRunsPerFixture: 3,
      chromeFlags: ["--headless", "--no-sandbox"],
      fixtures: ["sparse", "dense"],
    },
    runs: metrics,
    fixtureGroups,
    median: {
      performance: median(metrics.map(({ performance }) => performance)),
      fcp: median(metrics.map(({ fcp }) => fcp)),
      speedIndex: median(metrics.map(({ speedIndex }) => speedIndex)),
      lcp: median(metrics.map(({ lcp }) => lcp)),
      tbt: median(metrics.map(({ tbt }) => tbt)),
      cls: median(metrics.map(({ cls }) => cls)),
    },
  };

  const configurationHash = createHash("sha256").update(JSON.stringify(summary.environment)).digest("hex");
  writeFileSync(`${reportDirectory}/configuration.json`, `${JSON.stringify({ ...summary.environment, configurationHash }, null, 2)}\n`);

  for (const [fixture, group] of Object.entries(fixtureGroups)) {
    if (group.median.performance < 90 || group.runs.some(({ performance }) => performance < 85)) throw new Error(`${fixture} Lighthouse Performance score gate failed.`);
    if (group.median.fcp > 1800 || group.median.speedIndex > 3400 || group.median.lcp > 2500 || group.median.tbt > 200 || group.median.cls > .1) throw new Error(`${fixture} Lighthouse metric gate failed.`);
  }
  if (metrics.some(({ fcp, speedIndex, lcp, tbt, cls }) => fcp >= 3000 || speedIndex >= 5800 || lcp >= 4000 || tbt >= 600 || cls > .25)) throw new Error("A Lighthouse run entered a pinned poor metric band.");
  if (metrics.some(({ accessibility }) => accessibility < 100)) throw new Error("Lighthouse accessibility gate failed.");

  const seoPath = `${reportDirectory}/lighthouse-public-seo.json`;
  execFileSync("pnpm", ["exec", "lighthouse", origin, "--quiet", "--chrome-flags=--headless --no-sandbox", "--only-categories=seo", "--output=json", `--output-path=${seoPath}`], { stdio: "inherit" });
  const seoReport = JSON.parse(readFileSync(seoPath, "utf8")) as { categories: { seo: { score: number } } };
  const seo = seoReport.categories.seo.score * 100;
  if (seo < 100) throw new Error(`Lighthouse SEO gate failed with score ${seo}.`);

  const build = JSON.parse(readFileSync(".next/build-manifest.json", "utf8")) as { pages: Record<string, string[]>; rootMainFiles: string[] };
  const initialAssets = new Set([...build.rootMainFiles, ...(build.pages["/"] ?? []), ...(build.pages["/_app"] ?? [])]);
  let compressedJavaScript = 0;
  for (const asset of initialAssets) {
    if (!asset.endsWith(".js")) continue;
    compressedJavaScript += gzipSync(readFileSync(`.next/${asset}`)).length;
  }
  const initialTransfer = compressedJavaScript + gzipSync(readFileSync("app/globals.css")).length + statSync("public/fonts/source-serif-4.005/source-serif-regular.woff2").size + statSync("public/fonts/source-serif-4.005/source-serif-semibold.woff2").size;
  if (compressedJavaScript > 150 * 1024 || initialTransfer > 500 * 1024) throw new Error("Initial transfer budget failed.");

  const validator = process.env.VERAPDF_BIN ?? "/tmp/verapdf-1.30.2-ticket03/verapdf";
  const pdfPaths = Object.fromEntries(fixtureNames.map((fixture: RendererFixtureName) => [fixture, fixture === "typical"
    ? "public/michael-vasandani-resume.pdf"
    : `${fixtureDirectory}/pdfs/${fixture}.pdf`]));
  for (const [fixture, pdfPath] of Object.entries(pdfPaths)) {
    const validation = spawnSync(validator, ["-f", "ua1", "--format", "json", pdfPath], { encoding: "utf8" });
    if (validation.status !== 0) throw new Error(`veraPDF 1.30.2 PDF/UA-1 validation failed for ${fixture}: ${validation.stdout || validation.stderr}`);
    writeFileSync(`${reportDirectory}/verapdf-ua1-${fixture}.json`, validation.stdout);
    if (fixture === "typical") writeFileSync(`${reportDirectory}/verapdf-ua1.json`, validation.stdout);
  }

  const hashes = ["package.json", "pnpm-lock.yaml", "app/globals.css", "public/michael-vasandani-resume.pdf"].map((path) => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") }));
  writeFileSync(`${reportDirectory}/quality-summary.json`, `${JSON.stringify({ ...summary, configurationHash, seo, budgets: { compressedJavaScript, initialTransfer }, pdfUaFixtures: fixtureNames, hashes }, null, 2)}\n`);
  process.stdout.write(`Renderer quality checks passed: median Performance ${summary.median.performance}, JavaScript ${compressedJavaScript} B, transfer ${initialTransfer} B.\n`);
} finally {
  server.stop();
}
