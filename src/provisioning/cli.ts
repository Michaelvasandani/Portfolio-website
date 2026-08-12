import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import type { ProvisioningVerificationReport, TextArtifact } from "./verify";

const execFileAsync = promisify(execFile);
const binaryExtensions = new Set([
  ".avif",
  ".docx",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);
const excludedDirectoryNames = new Set([".git", ".next", "node_modules"]);
const maximumScannedFileBytes = 1_000_000;

export interface CliArguments {
  manifestPath: string;
  probesPath: string;
  publicDirectory: string;
}

export function parseCliArguments(arguments_: string[]): CliArguments {
  const normalizedArguments = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const values = new Map<string, string>();
  for (let index = 0; index < normalizedArguments.length; index += 2) {
    const flag = normalizedArguments[index];
    const value = normalizedArguments[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("usage: --manifest <redacted-manifest.json> --probes <redacted-probes.json> [--public-dir <dir>]");
    }
    if (!["--manifest", "--probes", "--public-dir"].includes(flag)) {
      throw new Error(`unknown provisioning verification argument: ${flag}`);
    }
    values.set(flag, value);
  }
  const manifestPath = values.get("--manifest");
  const probesPath = values.get("--probes");
  const publicDirectory = values.get("--public-dir");
  if (!manifestPath || !probesPath) throw new Error("--manifest and --probes are required");
  if (!publicDirectory) throw new Error("--public-dir is required for a complete public-bundle scan");
  return { manifestPath, probesPath, publicDirectory };
}

async function enumerateFiles(path: string): Promise<string[]> {
  const details = await stat(path).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!details) return [];
  if (!details.isDirectory()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !excludedDirectoryNames.has(entry.name))
      .map((entry) => enumerateFiles(join(path, entry.name))),
  );
  return nested.flat();
}

export async function collectTextArtifacts(paths: string[]): Promise<TextArtifact[]> {
  const files = (await Promise.all(paths.map(enumerateFiles))).flat();
  const artifacts: TextArtifact[] = [];
  for (const path of files) {
    if (binaryExtensions.has(extname(path).toLowerCase())) continue;
    const details = await stat(path);
    if (details.size > maximumScannedFileBytes) continue;
    const bytes = await readFile(path);
    if (bytes.includes(0)) continue;
    artifacts.push({ path, content: bytes.toString("utf8") });
  }
  return artifacts;
}

export async function listRepositoryFiles(repositoryRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 10_000_000 },
  );
  return stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => resolve(repositoryRoot, path));
}

export async function readJsonDocument(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export function relativizeArtifactPaths(artifacts: TextArtifact[], root: string): TextArtifact[] {
  return artifacts.map((artifact) => ({ ...artifact, path: relative(root, artifact.path) }));
}

export function renderVerificationReport(report: ProvisioningVerificationReport): string {
  return JSON.stringify(report, null, 2);
}

export function exitCodeForReport(report: ProvisioningVerificationReport): 0 | 1 | 2 {
  if (report.ticketStatus === "accepted") return 0;
  if (report.ticketStatus === "pending-human-provider-actions") return 2;
  return 1;
}
