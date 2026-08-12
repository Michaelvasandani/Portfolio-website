import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { contractSamples } from "../domain/test-samples";
import { careerSnapshotSchema } from "../domain/contracts";
import {
  CAREER_PARSER_IDENTITY,
  CAREER_SANDBOX_POLICY,
  CareerIngestionError,
  CareerIngestionService,
  type BlobUploadProvider,
  type CareerDraft,
  type CareerSnapshot,
  type CareerSandbox,
  type SandboxParseReport,
} from "./service";
import { InMemoryCareerIngestionStore } from "./store";

const clock = new Date("2026-08-12T19:00:00.000Z");
const expectedHash = `sha256:${"a".repeat(64)}`;
const sampleCareerSnapshot = careerSnapshotSchema.parse(contractSamples.careerSnapshot);

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function acceptedReport(
  detectedType: SandboxParseReport["validations"]["detectedType"] = "text/markdown",
): SandboxParseReport {
  const career = structuredClone(sampleCareerSnapshot) as Partial<CareerSnapshot>;
  delete career.id;
  delete career.contentHash;
  delete career.createdAt;
  return {
    schemaVersion: 1,
    parser: CAREER_PARSER_IDENTITY,
    policy: CAREER_SANDBOX_POLICY,
    validations: {
      detectedType,
      computedHash: expectedHash,
      sourceBytes: 4_096,
      signatureValid: true,
      parserCompatible: true,
      encrypted: false,
      imageOnly: false,
      macros: false,
      linkedResources: false,
      metadataEntries: 0,
      metadataSanitized: true,
      networkAttempts: 0,
      blockedNetworkAttempts: 0,
      elapsedMs: 120,
      peakMemoryBytes: 24_000_000,
      fileCount: detectedType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? 7 : 1,
      expandedBytes: 4_096,
      extractedTextBytes: 2_048,
      extractedCharacters: 1_900,
      recognizedCharacters: 1_900,
    },
    findings: [],
    career: { ...career, sourceDocumentHash: expectedHash } as CareerDraft,
  };
}

class RecordingBlobProvider implements BlobUploadProvider {
  readonly calls: Array<{ intentId: string; objectKey: string }> = [];

  constructor(private readonly onIssue?: () => void) {}

  async issueClientUploadGrant(input: {
    intentId: string;
    objectKey: string;
    contentType: string;
    maximumBytes: number;
    expiresAt: Date;
  }) {
    this.onIssue?.();
    this.calls.push({ intentId: input.intentId, objectKey: input.objectKey });
    return {
      uploadUrl: "https://blob.example.test/client-upload",
      token: "opaque-single-purpose-token",
      objectKey: input.objectKey,
      contentType: input.contentType,
      maximumBytes: input.maximumBytes,
      expiresAt: input.expiresAt,
    };
  }

  async deletionState() {
    return "present" as const;
  }

  async deleteRawBlob() {}
}

class ReportSandbox implements CareerSandbox {
  readonly requests: unknown[] = [];

  constructor(private readonly report: SandboxParseReport) {}

  async parse(input: Parameters<CareerSandbox["parse"]>[0]) {
    this.requests.push(structuredClone(input));
    return structuredClone(this.report);
  }
}

function service(input?: {
  store?: InMemoryCareerIngestionStore;
  blob?: BlobUploadProvider;
  sandbox?: CareerSandbox;
}) {
  const store = input?.store ?? new InMemoryCareerIngestionStore();
  return {
    store,
    service: new CareerIngestionService({
      store,
      blob: input?.blob ?? new RecordingBlobProvider(),
      sandbox: input?.sandbox ?? new ReportSandbox(acceptedReport()),
      now: () => clock,
      randomId: () => "intent-001",
      contacts: {
        email: "michael@example.com",
        github: "https://github.com/michael",
        linkedin: "https://linkedin.com/in/michael",
      },
    }),
  };
}

describe("career upload intents", () => {
  it("records a supported upload intent before issuing an exact-declared-size Blob grant", async () => {
    const store = new InMemoryCareerIngestionStore();
    const blob = new RecordingBlobProvider(() => {
      expect(store.intent("upload:intent-001")).toMatchObject({
        status: "awaiting-upload",
        objectKey: "raw-career/upload:intent-001/resume.md",
      });
    });
    const harness = service({ store, blob });

    await expect(
      harness.service.issueUpload({
        filename: "resume.md",
        declaredType: "text/markdown",
        size: 2_048,
        expectedHash,
      }),
    ).resolves.toMatchObject({
      intentId: "upload:intent-001",
      contentType: "text/markdown",
      maximumBytes: 2_048,
      objectKey: "raw-career/upload:intent-001/resume.md",
      publicProjectionWarning:
        "Uploaded content is intended for public projection. Exclude employer-confidential narrative.",
    });
    expect(blob.calls).toEqual([
      { intentId: "upload:intent-001", objectKey: "raw-career/upload:intent-001/resume.md" },
    ]);
  });

  it.each([
    ["oversized content", { size: 10 * 1024 * 1024 + 1 }, "upload-too-large"],
    ["unsupported declared type", { declaredType: "application/rtf" }, "declared-type-unsupported"],
    ["unsafe filename", { filename: "../resume.md" }, "upload-intent-invalid"],
  ])("rejects %s before a Blob grant", async (_label, override, code) => {
    const blob = new RecordingBlobProvider();
    const harness = service({ blob });

    await expect(
      harness.service.issueUpload({
        filename: "resume.md",
        declaredType: "text/markdown",
        size: 1,
        expectedHash,
        ...override,
      }),
    ).rejects.toMatchObject({ code });
    expect(blob.calls).toHaveLength(0);
  });

  it("fails closed and enqueues reconciliation when Blob returns a widened grant", async () => {
    const store = new InMemoryCareerIngestionStore();
    const blob: BlobUploadProvider = {
      async issueClientUploadGrant(input) {
        return {
          uploadUrl: "https://blob.example.test/client-upload",
          token: "opaque-token",
          objectKey: "raw-career/another-intent/resume.md",
          contentType: input.contentType,
        maximumBytes: input.maximumBytes + 1,
          expiresAt: input.expiresAt,
        };
      },
      async deletionState() { return "unknown"; },
      async deleteRawBlob() {},
    };
    const harness = service({ store, blob });

    await expect(
      harness.service.issueUpload({
        filename: "resume.md",
        declaredType: "text/markdown",
        size: 1,
        expectedHash,
      }),
    ).rejects.toMatchObject({ code: "upload-grant-invalid" });
    expect(store.intent("upload:intent-001")).toMatchObject({
      status: "rejected",
      failureCode: "upload-grant-invalid",
    });
    expect(store.deletionRecords()).toEqual([
      expect.objectContaining({ blobKey: "raw-career/upload:intent-001/resume.md", state: "pending" }),
    ]);
  });

  it("records provider timeout as a redacted failed intent and reconciles the possible Blob", async () => {
    const rawProviderDetail = "private-provider-timeout-detail";
    const store = new InMemoryCareerIngestionStore();
    const blob: BlobUploadProvider = {
      issueClientUploadGrant: vi.fn().mockRejectedValue(new Error(rawProviderDetail)),
      deletionState: vi.fn(),
      deleteRawBlob: vi.fn(),
    };
    const harness = service({ store, blob });

    await expect(
      harness.service.issueUpload({
        filename: "resume.md",
        declaredType: "text/markdown",
        size: 1,
        expectedHash,
      }),
    ).rejects.toMatchObject({ code: "upload-provider-unavailable" });
    expect(store.serializedState()).not.toContain(rawProviderDetail);
    expect(store.deletionRecords()).toHaveLength(1);
  });
});

describe("complete Career replacement", () => {
  it.each([
    ["Markdown", "text/markdown"],
    ["DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["text PDF", "application/pdf"],
  ] as const)("installs the complete lossless %s snapshot with provenance and enqueues raw deletion", async (_label, type) => {
    const report = acceptedReport(type);
    const sandbox = new ReportSandbox(report);
    const harness = service({ sandbox });
    const upload = await harness.service.issueUpload({
      filename: type === "text/markdown" ? "resume.md" : type === "application/pdf" ? "resume.pdf" : "resume.docx",
      declaredType: type,
      size: 4_096,
      expectedHash,
    });

    const outcome = await harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey });

    expect(outcome).toMatchObject({ decision: "accepted", duplicate: false });
    expect(harness.store.currentSnapshot()).toMatchObject({
      id: outcome.snapshotId,
      sourceDocumentHash: expectedHash,
      person: report.career.person,
      experience: report.career.experience,
      education: report.career.education,
      projects: report.career.projects,
      skills: report.career.skills,
      optionalSections: report.career.optionalSections,
    });
    expect(harness.store.currentSnapshot()?.person.name).toEqual(
      sampleCareerSnapshot.person.name,
    );
    expect(harness.store.deletionRecords()).toEqual([
      expect.objectContaining({ blobKey: upload.objectKey, state: "pending", attempts: 0 }),
    ]);
    expect(sandbox.requests).toEqual([
      expect.objectContaining({
        blobKey: upload.objectKey,
        declaredType: type,
        expectedHash,
        parser: CAREER_PARSER_IDENTITY,
        policy: CAREER_SANDBOX_POLICY,
      }),
    ]);
  });

  it("records Display normalization without changing verbatim values", async () => {
    const report = acceptedReport();
    report.career.person.name = {
      original: "Michael  Vasandani",
      normalized: "Michael Vasandani",
      transformation: "whitespace",
      sourceOrder: 0,
      sourceLocation: "line:1",
    };
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    await harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey });

    expect(harness.store.currentSnapshot()?.person.name).toEqual(report.career.person.name);
  });

  it("accepts a text PDF after harmless document metadata is removed in the Sandbox", async () => {
    const report = acceptedReport("application/pdf");
    report.validations.metadataEntries = 3;
    report.validations.metadataSanitized = true;
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.pdf",
      declaredType: "application/pdf",
      size: 4_096,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).resolves.toMatchObject({ decision: "accepted" });
  });
});

describe("fail-closed replacement", () => {
  it.each([
    "signature-mismatch",
    "hash-mismatch",
    "parser-incompatible",
    "encrypted-document",
    "image-only-document",
    "malformed-document",
    "ambiguous-parentage",
    "unknown-material-section",
    "duplicate-conflict",
    "dropped-text",
    "unsafe-url",
    "secret-detected",
    "phone-number-detected",
    "street-address-detected",
    "metadata-detected",
    "contact-not-allowlisted",
    "macro-detected",
    "linked-resource-detected",
    "sandbox-network-enabled",
    "sandbox-time-limit",
    "sandbox-memory-limit",
    "sandbox-file-count-limit",
    "sandbox-expansion-limit",
    "sandbox-text-size-limit",
  ] as const)("rejects %s, preserves the prior snapshot, and enqueues deletion", async (code) => {
    const store = new InMemoryCareerIngestionStore({ currentSnapshot: sampleCareerSnapshot });
    const report = acceptedReport();
    report.findings = [{ code, location: "section:experience", message: "Action required." }];
    const harness = service({ store, sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toMatchObject({ code });
    expect(store.currentSnapshot()).toEqual(sampleCareerSnapshot);
    expect(store.intent(upload.intentId)).toMatchObject({ status: "rejected", failureCode: code });
    expect(store.deletionRecords()).toEqual([
      expect.objectContaining({ blobKey: upload.objectKey, state: "pending" }),
    ]);
    expect(JSON.stringify(store)).not.toContain("Action required.");
  });

  it("rejects an independently detected type or hash mismatch even when the Sandbox reports no finding", async () => {
    const report = acceptedReport("application/pdf");
    report.validations.computedHash = `sha256:${"b".repeat(64)}`;
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toBeInstanceOf(CareerIngestionError);
    expect(harness.store.currentSnapshot()).toBeNull();
    expect(harness.store.deletionRecords()).toHaveLength(1);
  });

  it("rejects a Career draft whose source hash differs from the independently computed upload hash", async () => {
    const report = acceptedReport();
    report.career.sourceDocumentHash = `sha256:${"c".repeat(64)}`;
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toMatchObject({ code: "hash-mismatch" });
  });

  it.each([
    ["missing person name", (report: SandboxParseReport) => { report.career.person.name.original = "   "; }, "person-name-missing"],
    ["unparseable experience date", (report: SandboxParseReport) => { report.career.experience[0]!.dates.start.original = "sometime later"; }, "date-unparseable"],
    ["private project URL", (report: SandboxParseReport) => {
      report.career.projects = [{
        id: "project:private",
        name: { original: "Private", sourceOrder: 0, sourceLocation: "line:1" },
        technologies: [],
        sourceLinks: [{ original: "https://127.0.0.1/private", sourceOrder: 1, sourceLocation: "line:2" }],
        sourceOrder: 0,
        bullets: [],
      }];
    }, "unsafe-url"],
    ["LinkedIn as project evidence", (report: SandboxParseReport) => {
      report.career.projects = [{
        id: "project:linkedin",
        name: { original: "LinkedIn", sourceOrder: 0, sourceLocation: "line:1" },
        technologies: [],
        sourceLinks: [{ original: "https://www.linkedin.com/in/michael", sourceOrder: 1, sourceLocation: "line:2" }],
        sourceOrder: 0,
        bullets: [],
      }];
    }, "unsafe-url"],
    ["LinkedIn in résumé narrative", (report: SandboxParseReport) => {
      report.career.experience[0]!.bullets[0]!.text.original = "See https://www.linkedin.com/in/michael";
    }, "unsafe-url"],
    ["private URL in résumé narrative", (report: SandboxParseReport) => {
      report.career.experience[0]!.bullets[0]!.text.original = "See https://10.0.0.1/private";
    }, "unsafe-url"],
  ] as const)("rejects %s independently of Sandbox findings", async (_label, mutate, code) => {
    const report = acceptedReport();
    mutate(report);
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toMatchObject({ code });
  });

  it("rejects an independently failed signature check even when the detected type matches", async () => {
    const report = acceptedReport();
    report.validations.signatureValid = false;
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toMatchObject({ code: "signature-mismatch" });
  });

  it("distinguishes blocked linked-resource attempts from an enabled Sandbox network", async () => {
    const report = acceptedReport("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    report.validations.linkedResources = true;
    report.validations.networkAttempts = 1;
    report.validations.blockedNetworkAttempts = 1;
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.docx",
      declaredType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 4_096,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toMatchObject({ code: "linked-resource-detected" });
  });

  it("rejects policy drift and proves the pinned Sandbox bounds are all checked", async () => {
    const report = acceptedReport();
    report.policy = { ...report.policy, network: "restricted" };
    report.validations = {
      ...report.validations,
      elapsedMs: CAREER_SANDBOX_POLICY.wallTimeMs + 1,
      peakMemoryBytes: CAREER_SANDBOX_POLICY.memoryBytes + 1,
      fileCount: CAREER_SANDBOX_POLICY.fileCount + 1,
      expandedBytes: CAREER_SANDBOX_POLICY.expandedBytes + 1,
      extractedTextBytes: CAREER_SANDBOX_POLICY.extractedTextBytes + 1,
      networkAttempts: 1,
      blockedNetworkAttempts: 0,
    };
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toMatchObject({ code: "sandbox-policy-mismatch" });
    expect(harness.store.deletionRecords()).toHaveLength(1);
  });

  it("deletes raw content after an unexpected Sandbox failure without recording raw recovery data", async () => {
    const rawMarker = "RAW-PRIVATE-CONTENT-MUST-NOT-PERSIST";
    const sandbox: CareerSandbox = {
      parse: vi.fn().mockRejectedValue(new Error(rawMarker)),
    };
    const harness = service({ sandbox });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: rawMarker.length,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toMatchObject({ code: "sandbox-unavailable" });
    expect(harness.store.serializedState()).not.toContain(rawMarker);
    expect(harness.store.deletionRecords()).toHaveLength(1);
  });

  it("rejects a Sandbox report that contains undeclared raw content", async () => {
    const rawMarker = "RAW-BYTES-MUST-NOT-CROSS-THE-SANDBOX-BOUNDARY";
    const report = { ...acceptedReport(), rawContent: rawMarker } as unknown as SandboxParseReport;
    const harness = service({ sandbox: new ReportSandbox(report) });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: rawMarker.length,
      expectedHash,
    });

    await expect(
      harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey }),
    ).rejects.toMatchObject({ code: "sandbox-report-invalid" });
    expect(harness.store.serializedState()).not.toContain(rawMarker);
    expect(harness.store.deletionRecords()).toHaveLength(1);
  });
});

describe("replacement concurrency and idempotency", () => {
  it("treats a duplicate upload hash as a successful no-op while deleting the duplicate raw Blob", async () => {
    const harness = service();
    const first = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });
    const accepted = await harness.service.completeUpload({ intentId: first.intentId, objectKey: first.objectKey });
    const originalSnapshot = harness.store.currentSnapshot();
    const secondHarness = new CareerIngestionService({
      store: harness.store,
      blob: new RecordingBlobProvider(),
      sandbox: new ReportSandbox(acceptedReport()),
      now: () => new Date(clock.getTime() + 1_000),
      randomId: () => "intent-002",
      contacts: {
        email: "michael@example.com",
        github: "https://github.com/michael",
        linkedin: "https://linkedin.com/in/michael",
      },
    });
    const second = await secondHarness.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    await expect(
      secondHarness.completeUpload({ intentId: second.intentId, objectKey: second.objectKey }),
    ).resolves.toEqual({ decision: "accepted", duplicate: true, snapshotId: accepted.snapshotId });
    expect(harness.store.currentSnapshot()).toEqual(originalSnapshot);
    expect(harness.store.deletionRecords()).toHaveLength(2);
  });

  it("pins an in-flight Publication run to the prior snapshot while atomically advancing the current pointer", async () => {
    const store = new InMemoryCareerIngestionStore({ currentSnapshot: sampleCareerSnapshot });
    store.startPublicationRun({ id: "run:active", careerSnapshotId: sampleCareerSnapshot.id });
    const harness = service({ store });
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });

    const outcome = await harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey });

    expect(outcome.snapshotId).not.toBe(sampleCareerSnapshot.id);
    expect(store.publicationRun("run:active")).toEqual({
      id: "run:active",
      careerSnapshotId: sampleCareerSnapshot.id,
    });
    expect(store.currentSnapshot()?.id).toBe(outcome.snapshotId);
  });

  it("derives content-addressed immutable identity from the complete normalized snapshot", async () => {
    const harness = service();
    const upload = await harness.service.issueUpload({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 4_096,
      expectedHash,
    });
    await harness.service.completeUpload({ intentId: upload.intentId, objectKey: upload.objectKey });
    const snapshot = harness.store.currentSnapshot()!;
    const { contentHash: _storedHash, ...hashableSnapshot } = snapshot;
    const hash = createHash("sha256")
      .update(JSON.stringify(canonicalValue(hashableSnapshot)))
      .digest("hex");

    expect(_storedHash).toBe(`sha256:${hash}`);
    expect(snapshot.id).toMatch(/^career:[a-f0-9]{24}$/);
  });
});
