import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectTextArtifacts, exitCodeForReport, parseCliArguments, renderVerificationReport } from "./cli";
import type { ProvisioningVerificationReport } from "./verify";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("provisioning verification CLI", () => {
  it("requires explicit manifest and probe evidence inputs", () => {
    expect(() => parseCliArguments([])).toThrow(/--manifest.*--probes/i);
    expect(() =>
      parseCliArguments([
        "--manifest",
        "docs/provisioning/manifest.json",
        "--probes",
        "evidence/ticket-02-probes.json",
      ]),
    ).toThrow(/--public-dir/i);
    expect(
      parseCliArguments([
        "--",
        "--manifest",
        "docs/provisioning/manifest.json",
        "--probes",
        "evidence/ticket-02-probes.json",
        "--public-dir",
        ".next/static",
      ]),
    ).toEqual({
      manifestPath: "docs/provisioning/manifest.json",
      probesPath: "evidence/ticket-02-probes.json",
      publicDirectory: ".next/static",
    });
  });

  it("collects text artifacts while excluding dependency, git, and binary content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "portfolio-provisioning-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "source.ts"), "export const value = 'safe';");
    await writeFile(join(directory, "binary.png"), Buffer.from([0, 1, 2, 3]));

    const artifacts = await collectTextArtifacts([
      join(directory, "source.ts"),
      join(directory, "binary.png"),
      join(directory, "deleted-since-inventory.ts"),
    ]);

    expect(artifacts).toEqual([{ path: join(directory, "source.ts"), content: "export const value = 'safe';" }]);
  });

  it("renders only redacted scan metadata and a truthful pending status", () => {
    const report: ProvisioningVerificationReport = {
      localStatus: "verified",
      ticketStatus: "pending-human-provider-actions",
      errors: [],
      pending: ["Michael's provisioning checklist sign-off is pending"],
      scans: {
        repositoryFindings: [{ path: "fixture", category: "credential", fingerprint: "abc123abc123" }],
        publicBundleFindings: [],
      },
    };

    const rendered = renderVerificationReport(report);

    expect(rendered).toMatch(/pending-human-provider-actions/);
    expect(rendered).toMatch(/abc123abc123/);
    expect(rendered).not.toMatch(/token|password|secret value/i);
    expect(exitCodeForReport(report)).toBe(2);
    expect(exitCodeForReport({ ...report, localStatus: "failed", ticketStatus: "failed" })).toBe(1);
    expect(exitCodeForReport({ ...report, ticketStatus: "accepted", pending: [] })).toBe(0);
  });
});
