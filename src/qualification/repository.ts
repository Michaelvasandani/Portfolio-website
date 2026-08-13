import { createHash, createPublicKey, verify } from "node:crypto";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

import { z } from "zod";

import { renderOperatorHandoff } from "./handoff";
import {
  qualifyProduction,
  type ProductionQualificationReport,
  type PackageAudit,
  type QualificationTicket,
} from "./service";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const evidenceFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidence: z.array(
      z
        .object({
          itemId: z.string().min(1),
          outcome: z.enum(["passed", "pending", "failed"]),
          scope: z.enum(["repository", "production", "local"]),
          artifactPointers: z.array(z.string().min(1)),
          claims: z.array(z.string().min(1)),
          verifiedAt: z.string().datetime().optional(),
          signedBy: z.string().min(1).optional(),
          notes: z.string().min(1).optional(),
        })
        .strict(),
    ),
    artifacts: z.array(
      z
        .object({
          pointer: z.string().min(1),
          sha256: sha256Schema,
        })
        .strict(),
    ),
    ownerAttestation: z
      .object({
        signedBy: z.literal("Michael Sagar Vasandani"),
        algorithm: z.literal("ed25519"),
        signedAt: z.string().datetime(),
        ledgerSha256: sha256Schema,
        publicKeySha256: sha256Schema,
        signatureBase64: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export interface ProductionQualificationRunOptions {
  repositoryRoot: string;
  productionEvidencePath: string;
  outputDirectory: string;
  artifactRoot?: string;
  ownerPublicKeyPath?: string;
  generatedAt?: string;
}

export interface ProductionQualificationRunResult {
  exitCode: 0 | 1;
  report: ProductionQualificationReport;
}

function extractRequirementIds(markdown: string): string[] {
  return [...markdown.matchAll(/\b[A-Z]{3}-\d{3}\b/g)].map((match) => match[0]!);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readTickets(repositoryRoot: string): Promise<QualificationTicket[]> {
  const issuesDirectory = join(
    repositoryRoot,
    ".scratch/agentic-portfolio-implementation/issues",
  );
  const filenames = (await readdir(issuesDirectory))
    .filter((filename) => /^\d{2}-.*\.md$/.test(filename))
    .sort();

  return Promise.all(
    filenames.map(async (filename) => {
      const markdown = await readFile(join(issuesDirectory, filename), "utf8");
      const id = basename(filename).slice(0, 2);
      const status = markdown.match(/^Status: (.+)$/m)?.[1]?.trim() ?? "missing";
      const blockerLine = markdown.match(/^Blocked by: (.+)$/m)?.[1]?.trim() ?? "";
      const requirementsSection = markdown.split(/^## Requirements\s*$/m)[1] ?? "";
      const evidencePath = join(repositoryRoot, `evidence/ticket-${id}.md`);
      const evidenceExists = await exists(evidencePath);
      const evidenceMarkdown = evidenceExists ? await readFile(evidencePath, "utf8") : "";
      const evidenceStatus = evidenceMarkdown.match(/^(?:Ticket status|Status):\s*\*{0,2}(.+)$/im)?.[1] ?? "";
      const incompleteClosure =
        status === "complete" && /\b(?:open|pending|blocked|incomplete|local)\b/i.test(evidenceStatus);
      const explicitCompleteClosure = /\b(?:complete|closed)\b/i.test(evidenceStatus);
      const closureTargets = [...evidenceMarkdown.matchAll(/\]\((?!https?:|mailto:)([^)]+)\)/g)]
        .map((match) => match[1]!.split("#")[0]!)
        .filter(Boolean);
      const evidenceRoot = resolve(repositoryRoot);
      const resolvedClosureEvidence =
        closureTargets.length > 0 &&
        (
          await Promise.all(
            closureTargets.map(async (target) => {
              const path = resolve(dirname(evidencePath), target);
              if (path !== evidenceRoot && !path.startsWith(`${evidenceRoot}${sep}`)) return false;
              if (!(await exists(path))) return false;
              const artifact = await stat(path);
              return artifact.isDirectory()
                ? (await readdir(path)).length > 0
                : artifact.size > 0;
            }),
          )
        ).every(Boolean);
      const unresolvedMarker = /\[(?:PLACEHOLDER|WAIVER_APPLIED)\]|TODO_ACCEPTANCE/.test(evidenceMarkdown);
      return {
        id,
        status,
        blockers: blockerLine === "none" ? [] : uniqueSorted(blockerLine.match(/\b\d{2}\b/g) ?? []),
        requirementIds: uniqueSorted(extractRequirementIds(requirementsSection)),
        evidencePointers: evidenceExists ? [`evidence/ticket-${id}.md`] : [],
        evidenceVerified:
          evidenceExists &&
          explicitCompleteClosure &&
          resolvedClosureEvidence &&
          !incompleteClosure &&
          !unresolvedMarker,
      };
    }),
  );
}

type EvidenceFile = z.infer<typeof evidenceFileSchema>;

async function readProductionEvidence(path: string): Promise<EvidenceFile> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return evidenceFileSchema.parse(parsed);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function verifyArtifacts(
  artifactRoot: string,
  evidenceFile: EvidenceFile,
): Promise<string[]> {
  const root = resolve(artifactRoot);
  const verified: string[] = [];
  for (const artifact of evidenceFile.artifacts) {
    const path = resolve(root, artifact.pointer);
    if (path !== root && !path.startsWith(`${root}${sep}`)) continue;
    if (!(await exists(path))) continue;
    if (sha256(await readFile(path)) === artifact.sha256) verified.push(artifact.pointer);
  }
  return verified;
}

async function verifyOwnerAttestation(
  evidenceFile: EvidenceFile,
  ownerPublicKeyPath: string | undefined,
): Promise<boolean> {
  if (!evidenceFile.ownerAttestation || !ownerPublicKeyPath) return false;
  const publicKeyBytes = await readFile(ownerPublicKeyPath);
  if (sha256(publicKeyBytes) !== evidenceFile.ownerAttestation.publicKeySha256) return false;
  const ledger = JSON.stringify({
    schemaVersion: evidenceFile.schemaVersion,
    evidence: evidenceFile.evidence,
    artifacts: evidenceFile.artifacts,
  });
  if (sha256(ledger) !== evidenceFile.ownerAttestation.ledgerSha256) return false;
  try {
    return verify(
      null,
      Buffer.from(evidenceFile.ownerAttestation.ledgerSha256, "hex"),
      createPublicKey(publicKeyBytes),
      Buffer.from(evidenceFile.ownerAttestation.signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

const requiredPackageArtifacts = [
  "README.md",
  "spec.md",
  "traceability.md",
  "threat-model.md",
  "fixtures/catalog.md",
  "runbooks/README.md",
] as const;

const requiredRunbookChecklists = [
  "Provisioning",
  "Owner access and session recovery",
  "Credential rotation",
  "Normal publication",
  "Monitoring",
  "Incident response",
  "Rollback and verification",
  "Circuit-breaker clearance",
  "Manual restore",
  "Retention",
  "Backup and database recovery",
  "Decommissioning",
] as const;

async function markdownFiles(packageRoot: string): Promise<string[]> {
  const directories = ["", "fixtures", "runbooks", "issues"];
  const files: string[] = [];
  for (const directory of directories) {
    const directoryPath = join(packageRoot, directory);
    if (!(await exists(directoryPath))) continue;
    for (const filename of await readdir(directoryPath)) {
      if (filename.endsWith(".md")) files.push(join(directoryPath, filename));
    }
  }
  return files;
}

async function inspectPackage(packageRoot: string): Promise<PackageAudit> {
  const missingPackageArtifacts: string[] = [];
  for (const path of requiredPackageArtifacts) {
    if (!(await exists(join(packageRoot, path)))) missingPackageArtifacts.push(path);
  }
  const runbookPath = join(packageRoot, "runbooks/README.md");
  const runbooks = (await exists(runbookPath)) ? await readFile(runbookPath, "utf8") : "";
  const missingRunbookChecklists = requiredRunbookChecklists.filter(
    (heading) =>
      !runbooks.includes(`## ${heading}\n`) ||
      !/- \[[ x]\]/.test(runbooks.split(`## ${heading}\n`)[1]?.split(/^## /m)[0] ?? ""),
  );
  const brokenPackageLinks: string[] = [];
  for (const document of await markdownFiles(packageRoot)) {
    const markdown = await readFile(document, "utf8");
    for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1]!.split("#")[0]!;
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      if (!(await exists(resolve(dirname(document), target)))) {
        brokenPackageLinks.push(`${document.slice(packageRoot.length + 1)}:${target}`);
      }
    }
  }
  return { missingPackageArtifacts, brokenPackageLinks, missingRunbookChecklists };
}

export async function runProductionQualification(
  options: ProductionQualificationRunOptions,
): Promise<ProductionQualificationRunResult> {
  const packageRoot = join(options.repositoryRoot, ".scratch/agentic-portfolio-implementation");
  const [specification, traceability, tickets, evidenceFile, packageAudit] = await Promise.all([
    readFile(join(packageRoot, "spec.md"), "utf8"),
    readFile(join(packageRoot, "traceability.md"), "utf8"),
    readTickets(options.repositoryRoot),
    readProductionEvidence(options.productionEvidencePath),
    inspectPackage(packageRoot),
  ]);
  const [verifiedArtifactPointers, ownerAttestationVerified] = await Promise.all([
    verifyArtifacts(options.artifactRoot ?? options.repositoryRoot, evidenceFile),
    verifyOwnerAttestation(evidenceFile, options.ownerPublicKeyPath),
  ]);
  const requirementIds = uniqueSorted(
    [...specification.matchAll(/^### ([A-Z]{3}-\d{3})\b/gm)].map((match) => match[1]!),
  );
  const tracedRequirementIds = uniqueSorted(
    [...traceability.matchAll(/^\| ([A-Z]{3}-\d{3})\b/gm)].map((match) => match[1]!),
  );
  const report = qualifyProduction({
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    requirementIds,
    tracedRequirementIds,
    tickets,
    evidence: evidenceFile.evidence,
    verifiedArtifactPointers,
    ownerAttestationVerified,
    packageAudit,
  });

  await mkdir(options.outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(options.outputDirectory, "qualification-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    ),
    writeFile(join(options.outputDirectory, "operator-handoff.md"), renderOperatorHandoff(report)),
  ]);

  return { exitCode: report.outcome === "qualified" ? 0 : 1, report };
}
