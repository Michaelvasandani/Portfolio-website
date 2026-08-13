import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runProductionQualification } from "./repository";
import { PRODUCTION_QUALIFICATION_ITEMS } from "./service";

async function createRepositoryFixture(): Promise<{
  root: string;
  outputRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "portfolio-qualification-"));
  const packageRoot = join(root, ".scratch/agentic-portfolio-implementation");
  const issuesRoot = join(packageRoot, "issues");
  const outputRoot = join(root, "evidence/ticket-11");
  await mkdir(issuesRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "spec.md"),
    "### PRD-001 — Product\n\n### OPS-003 — Completion\n",
  );
  await writeFile(
    join(packageRoot, "traceability.md"),
    "| PRD-001 Product | decisions | tickets | evidence |\n| OPS-003 Completion | decisions | tickets | evidence |\n",
  );
  await writeFile(join(packageRoot, "README.md"), "# Package\n");
  await writeFile(join(packageRoot, "threat-model.md"), "# Threat model\n");
  await mkdir(join(packageRoot, "fixtures"), { recursive: true });
  await writeFile(join(packageRoot, "fixtures/catalog.md"), "# Fixtures\n");
  await mkdir(join(packageRoot, "runbooks"), { recursive: true });
  await writeFile(
    join(packageRoot, "runbooks/README.md"),
    [
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
    ]
      .map((heading) => `## ${heading}\n\n- [ ] Exercise\n`)
      .join("\n"),
  );
  await writeFile(
    join(issuesRoot, "01-foundations.md"),
    "# Foundations\n\nStatus: complete\nBlocked by: none\n\n## Requirements\n\nPRD-001, OPS-003\n",
  );
  await mkdir(join(root, "evidence"), { recursive: true });
  await writeFile(
    join(root, "evidence/ticket-01.md"),
    "# Ticket 01 evidence\n\nStatus: complete\n\n[Reproducible report](../artifact.json)\n",
  );
  await writeFile(join(root, "artifact.json"), "reproducible closure evidence\n");
  return { root, outputRoot };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("runProductionQualification", () => {
  it("persists an incomplete report and returns a failing exit code when production evidence is pending", async () => {
    const { root, outputRoot } = await createRepositoryFixture();
    await writeFile(
      join(root, "production-evidence.json"),
      `${JSON.stringify({ schemaVersion: 1, evidence: [], artifacts: [] })}\n`,
    );

    const result = await runProductionQualification({
      repositoryRoot: root,
      productionEvidencePath: join(root, "production-evidence.json"),
      outputDirectory: outputRoot,
      generatedAt: "2026-08-12T20:00:00.000Z",
    });

    expect(result.exitCode).toBe(1);
    expect(result.report.audit).toEqual({
      orphanRequirements: [],
      unsupportedTraceabilityRequirements: [],
      unsupportedTicketRequirements: [],
      missingDependencies: [],
      invalidTicketStatuses: [],
      requirementsWithoutTickets: [],
      missingTicketEvidence: [],
      unknownEvidenceItems: [],
      duplicateEvidenceItems: [],
      missingPackageArtifacts: [],
      brokenPackageLinks: [],
      missingRunbookChecklists: [],
    });
    expect(result.report.incompleteEvidence.length).toBeGreaterThan(0);
    expect(JSON.parse(await readFile(join(outputRoot, "qualification-report.json"), "utf8"))).toEqual(
      result.report,
    );
    expect(await readFile(join(outputRoot, "operator-handoff.md"), "utf8")).toContain(
      "Qualification outcome: INCOMPLETE",
    );
  });

  it("qualifies only hash-resolved artifacts and a cryptographically verified Michael attestation", async () => {
    const { root, outputRoot } = await createRepositoryFixture();
    const artifact = '{"provider":"acceptance"}\n';
    await writeFile(join(root, "artifact.json"), artifact);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicKeyBytes = publicKey.export({ type: "spki", format: "pem" });
    await writeFile(join(root, "owner-public-key.pem"), publicKeyBytes);
    const evidence = PRODUCTION_QUALIFICATION_ITEMS.map((item) => ({
      itemId: item.id,
      outcome: "passed" as const,
      scope: item.requiredScope,
      artifactPointers: ["artifact.json"],
      claims: [...item.requiredClaims],
      verifiedAt: "2026-08-12T19:59:00.000Z",
      ...(item.owner === "Michael" ? { signedBy: "Michael Sagar Vasandani" as const } : {}),
    }));
    const unsignedLedger = {
      schemaVersion: 1 as const,
      evidence,
      artifacts: [{ pointer: "artifact.json", sha256: sha256(artifact) }],
    };
    const ledgerSha256 = sha256(JSON.stringify(unsignedLedger));
    const ledger = {
      ...unsignedLedger,
      ownerAttestation: {
        signedBy: "Michael Sagar Vasandani" as const,
        algorithm: "ed25519" as const,
        signedAt: "2026-08-12T20:00:00.000Z",
        ledgerSha256,
        publicKeySha256: sha256(publicKeyBytes),
        signatureBase64: sign(null, Buffer.from(ledgerSha256, "hex"), privateKey).toString("base64"),
      },
    };
    await writeFile(join(root, "production-evidence.json"), `${JSON.stringify(ledger)}\n`);

    const result = await runProductionQualification({
      repositoryRoot: root,
      productionEvidencePath: join(root, "production-evidence.json"),
      outputDirectory: outputRoot,
      artifactRoot: root,
      ownerPublicKeyPath: join(root, "owner-public-key.pem"),
      generatedAt: "2026-08-12T20:00:00.000Z",
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.outcome).toBe("qualified");

    await writeFile(join(root, "artifact.json"), '{"provider":"tampered"}\n');
    const tampered = await runProductionQualification({
      repositoryRoot: root,
      productionEvidencePath: join(root, "production-evidence.json"),
      outputDirectory: outputRoot,
      artifactRoot: root,
      ownerPublicKeyPath: join(root, "owner-public-key.pem"),
      generatedAt: "2026-08-12T20:00:00.000Z",
    });
    expect(tampered.exitCode).toBe(1);
    expect(tampered.report.incompleteEvidence).toContainEqual(
      expect.objectContaining({
        itemId: "ordinary-publication",
        reasons: ["artifact pointer was not resolved and hash-verified"],
      }),
    );
  });

  it("fails the exit audit for incomplete predecessor evidence, broken package links, and missing human checklists", async () => {
    const { root, outputRoot } = await createRepositoryFixture();
    await writeFile(
      join(root, "evidence/ticket-01.md"),
      "# Ticket 01 evidence\n\nStatus: open — placeholder evidence\n",
    );
    await writeFile(
      join(root, ".scratch/agentic-portfolio-implementation/spec.md"),
      "### PRD-001 — Product\n\n### OPS-003 — Completion\n\n[Missing](missing.md)\n",
    );
    await writeFile(
      join(root, ".scratch/agentic-portfolio-implementation/runbooks/README.md"),
      "## Monitoring\n\n- [ ] Exercise\n",
    );
    await writeFile(
      join(root, "production-evidence.json"),
      `${JSON.stringify({ schemaVersion: 1, evidence: [], artifacts: [] })}\n`,
    );

    const result = await runProductionQualification({
      repositoryRoot: root,
      productionEvidencePath: join(root, "production-evidence.json"),
      outputDirectory: outputRoot,
      generatedAt: "2026-08-12T20:00:00.000Z",
    });

    expect(result.report.outcome).toBe("incomplete");
    expect(result.report.audit.missingTicketEvidence).toEqual(["01"]);
    expect(result.report.audit.brokenPackageLinks).toEqual(["spec.md:missing.md"]);
    expect(result.report.audit.missingRunbookChecklists).toContain("Provisioning");
  });

  it("rejects heading-only evidence for a predecessor marked complete", async () => {
    const { root, outputRoot } = await createRepositoryFixture();
    await writeFile(join(root, "evidence/ticket-01.md"), "# Ticket 01 evidence\n");
    await writeFile(
      join(root, "production-evidence.json"),
      `${JSON.stringify({ schemaVersion: 1, evidence: [], artifacts: [] })}\n`,
    );

    const result = await runProductionQualification({
      repositoryRoot: root,
      productionEvidencePath: join(root, "production-evidence.json"),
      outputDirectory: outputRoot,
      generatedAt: "2026-08-12T20:00:00.000Z",
    });

    expect(result.report.audit.missingTicketEvidence).toEqual(["01"]);
  });

  it("rejects a completed predecessor whose closure evidence link does not resolve", async () => {
    const { root, outputRoot } = await createRepositoryFixture();
    await writeFile(
      join(root, "evidence/ticket-01.md"),
      "# Ticket 01 evidence\n\nStatus: complete\n\n[Missing report](missing.json)\n",
    );
    await writeFile(
      join(root, "production-evidence.json"),
      `${JSON.stringify({ schemaVersion: 1, evidence: [], artifacts: [] })}\n`,
    );

    const result = await runProductionQualification({
      repositoryRoot: root,
      productionEvidencePath: join(root, "production-evidence.json"),
      outputDirectory: outputRoot,
      generatedAt: "2026-08-12T20:00:00.000Z",
    });

    expect(result.report.audit.missingTicketEvidence).toEqual(["01"]);
  });
});
import { createHash, generateKeyPairSync, sign } from "node:crypto";
