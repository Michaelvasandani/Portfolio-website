import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { careerSnapshotSchema } from "../domain/contracts";
import {
  CareerIngestionError,
  careerIngestionFailureCodes,
  type CareerIngestionFailureCode,
} from "./errors";
import type { CareerIngestionStore } from "./store";

export { CareerIngestionError, careerIngestionFailureCodes } from "./errors";
export type { CareerIngestionFailureCode } from "./errors";

const MEBIBYTE = 1024 * 1024;
const MAXIMUM_UPLOAD_BYTES = 10 * MEBIBYTE;
const UPLOAD_GRANT_LIFETIME_MS = 5 * 60 * 1_000;
const DELETION_DEADLINE_MS = 15 * 60 * 1_000;

export const CAREER_PARSER_IDENTITY = {
  name: "portfolio-career-parser",
  version: "1.0.0",
  image: "ghcr.io/michaelvasandani/portfolio-career-parser@sha256:5c4a6a254b92c76406994c8d917b3dadf903346cf4f936296376c19243e970b2",
} as const;

export const CAREER_SANDBOX_POLICY = {
  network: "none",
  wallTimeMs: 15_000,
  memoryBytes: 512 * MEBIBYTE,
  fileCount: 128,
  expandedBytes: 40 * MEBIBYTE,
  extractedTextBytes: 2 * MEBIBYTE,
  executeMacros: false,
  retrieveLinkedResources: false,
} as const;

const supportedTypes = [
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
] as const;

export type SupportedCareerDocumentType = (typeof supportedTypes)[number];
export type CareerSnapshot = z.infer<typeof careerSnapshotSchema>;
export type CareerDraft = Omit<CareerSnapshot, "id" | "contentHash" | "createdAt">;

export type SandboxPolicyReport = {
  network: string;
  wallTimeMs: number;
  memoryBytes: number;
  fileCount: number;
  expandedBytes: number;
  extractedTextBytes: number;
  executeMacros: boolean;
  retrieveLinkedResources: boolean;
};

export type SandboxParseReport = {
  schemaVersion: 1;
  parser: { name: string; version: string; image: string };
  policy: SandboxPolicyReport;
  validations: {
    detectedType: SupportedCareerDocumentType;
    computedHash: string;
    sourceBytes: number;
    signatureValid: boolean;
    parserCompatible: boolean;
    encrypted: boolean;
    imageOnly: boolean;
    macros: boolean;
    linkedResources: boolean;
    metadataEntries: number;
    metadataSanitized: boolean;
    networkAttempts: number;
    blockedNetworkAttempts: number;
    elapsedMs: number;
    peakMemoryBytes: number;
    fileCount: number;
    expandedBytes: number;
    extractedTextBytes: number;
    extractedCharacters: number;
    recognizedCharacters: number;
  };
  findings: Array<{
    code: CareerIngestionFailureCode;
    location: string;
    message: string;
  }>;
  career: CareerDraft;
};

const sandboxParseReportSchema: z.ZodType<SandboxParseReport> = z
  .object({
    schemaVersion: z.literal(1),
    parser: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        image: z.string().min(1),
      })
      .strict(),
    policy: z
      .object({
        network: z.string().min(1),
        wallTimeMs: z.number().int().positive(),
        memoryBytes: z.number().int().positive(),
        fileCount: z.number().int().positive(),
        expandedBytes: z.number().int().positive(),
        extractedTextBytes: z.number().int().positive(),
        executeMacros: z.boolean(),
        retrieveLinkedResources: z.boolean(),
      })
      .strict(),
    validations: z
      .object({
        detectedType: z.enum(supportedTypes),
        computedHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        sourceBytes: z.number().int().positive(),
        signatureValid: z.boolean(),
        parserCompatible: z.boolean(),
        encrypted: z.boolean(),
        imageOnly: z.boolean(),
        macros: z.boolean(),
        linkedResources: z.boolean(),
        metadataEntries: z.number().int().nonnegative(),
        metadataSanitized: z.boolean(),
        networkAttempts: z.number().int().nonnegative(),
        blockedNetworkAttempts: z.number().int().nonnegative(),
        elapsedMs: z.number().nonnegative(),
        peakMemoryBytes: z.number().int().nonnegative(),
        fileCount: z.number().int().nonnegative(),
        expandedBytes: z.number().int().nonnegative(),
        extractedTextBytes: z.number().int().nonnegative(),
        extractedCharacters: z.number().int().nonnegative(),
        recognizedCharacters: z.number().int().nonnegative(),
      })
      .strict(),
    findings: z.array(
      z
        .object({
          code: z.enum(careerIngestionFailureCodes),
          location: z.string().min(1),
          message: z.string().min(1),
        })
        .strict(),
    ),
    career: careerSnapshotSchema.omit({ id: true, contentHash: true, createdAt: true }),
  })
  .strict();

export interface CareerSandbox {
  parse(input: {
    blobKey: string;
    declaredType: SupportedCareerDocumentType;
    expectedHash: string;
    parser: typeof CAREER_PARSER_IDENTITY;
    policy: typeof CAREER_SANDBOX_POLICY;
  }): Promise<SandboxParseReport>;
}

export type ClientUploadGrant = {
  uploadUrl: string;
  token: string;
  objectKey: string;
  contentType: string;
  maximumBytes: number;
  expiresAt: Date;
};

export interface BlobUploadProvider {
  issueClientUploadGrant(input: {
    intentId: string;
    objectKey: string;
    contentType: SupportedCareerDocumentType;
    maximumBytes: number;
    expiresAt: Date;
  }): Promise<ClientUploadGrant>;
  deletionState(blobKey: string, idempotencyKey: string): Promise<"present" | "absent" | "unknown">;
  deleteRawBlob(blobKey: string, idempotencyKey: string): Promise<{ providerReference?: string } | void>;
}

type AllowedContacts = {
  email: string;
  github: string;
  linkedin: string;
};

type CareerIngestionServiceDependencies = {
  store: CareerIngestionStore;
  blob: BlobUploadProvider;
  sandbox: CareerSandbox;
  contacts: AllowedContacts;
  now?: () => Date;
  randomId?: () => string;
};

function supportedType(value: string): value is SupportedCareerDocumentType {
  return supportedTypes.some((type) => type === value);
}

function safeFilename(value: string, type: SupportedCareerDocumentType): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(value) || value.includes("..")) return false;
  const extension = value.slice(value.lastIndexOf(".")).toLowerCase();
  const expected = {
    "text/markdown": [".md", ".markdown"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/pdf": [".pdf"],
  }[type];
  return expected.includes(extension);
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

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

export function careerSnapshotContentHash(snapshot: Omit<CareerSnapshot, "contentHash">): string {
  return sha256(JSON.stringify(canonicalValue(snapshot)));
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reportFailure(
  report: SandboxParseReport,
  intent: { declaredType: string; expectedHash: string; size: number },
) {
  if (!equalJson(report.parser, CAREER_PARSER_IDENTITY)) return "parser-incompatible" as const;
  if (!report.validations.parserCompatible) return "parser-incompatible" as const;
  if (!equalJson(report.policy, CAREER_SANDBOX_POLICY)) return "sandbox-policy-mismatch" as const;
  if (report.validations.detectedType !== intent.declaredType) return "signature-mismatch" as const;
  if (!report.validations.signatureValid || report.validations.sourceBytes !== intent.size) {
    return "signature-mismatch" as const;
  }
  if (report.validations.computedHash !== intent.expectedHash) return "hash-mismatch" as const;
  if (report.validations.encrypted) return "encrypted-document" as const;
  if (report.validations.imageOnly) return "image-only-document" as const;
  if (report.validations.macros) return "macro-detected" as const;
  if (report.validations.linkedResources) return "linked-resource-detected" as const;
  if (report.validations.metadataEntries > 0 && !report.validations.metadataSanitized) {
    return "metadata-detected" as const;
  }
  if (report.validations.networkAttempts !== report.validations.blockedNetworkAttempts) {
    return "sandbox-network-enabled" as const;
  }
  if (report.validations.elapsedMs > CAREER_SANDBOX_POLICY.wallTimeMs) return "sandbox-time-limit" as const;
  if (report.validations.peakMemoryBytes > CAREER_SANDBOX_POLICY.memoryBytes) return "sandbox-memory-limit" as const;
  if (report.validations.fileCount > CAREER_SANDBOX_POLICY.fileCount) return "sandbox-file-count-limit" as const;
  if (report.validations.expandedBytes > CAREER_SANDBOX_POLICY.expandedBytes) return "sandbox-expansion-limit" as const;
  if (report.validations.extractedTextBytes > CAREER_SANDBOX_POLICY.extractedTextBytes) return "sandbox-text-size-limit" as const;
  if (report.validations.extractedCharacters !== report.validations.recognizedCharacters) return "dropped-text" as const;
  return report.findings[0]?.code;
}

function contactFailure(snapshot: CareerDraft, contacts: AllowedContacts): CareerIngestionFailureCode | undefined {
  const allowed = new Map([
    ["email", contacts.email],
    ["github", contacts.github],
    ["linkedin", contacts.linkedin],
  ]);
  for (const contact of snapshot.person.contacts) {
    const value = contact.value.normalized ?? contact.value.original;
    if (value !== allowed.get(contact.kind)) return "contact-not-allowlisted";
  }
  for (const project of snapshot.projects) {
    for (const link of project.sourceLinks) {
      const value = link.normalized ?? link.original;
      if (!safePublicUrl(value) || new URL(value).hostname.endsWith("linkedin.com")) return "unsafe-url";
    }
  }
  return undefined;
}

function safePublicUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(host)) return false;
  const private172 = /^172\.(\d{1,3})\./.exec(host);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
  return true;
}

function dateValueIsParseable(value: string): boolean {
  const cleaned = value.trim();
  return /^(?:19|20)\d{2}$/.test(cleaned) ||
    /^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?:19|20)\d{2}$/i.test(cleaned) ||
    /^\d{4}-(?:0[1-9]|1[0-2])(?:-\d{2})?$/.test(cleaned);
}

function careerInvariantFailure(
  snapshot: CareerDraft,
  expectedHash: string,
): CareerIngestionFailureCode | undefined {
  if (snapshot.sourceDocumentHash !== expectedHash) return "hash-mismatch";
  if (!snapshot.person.name.original.trim()) return "person-name-missing";
  const dateRanges = [
    ...snapshot.experience.map(({ dates }) => dates),
    ...snapshot.education.map(({ dates }) => dates),
  ];
  for (const dates of dateRanges) {
    if (!dateValueIsParseable(dates.start.original)) return "date-unparseable";
    if (!dates.current && dates.end && !dateValueIsParseable(dates.end.original)) return "date-unparseable";
  }
  const withoutApprovedContacts = {
    person: { name: snapshot.person.name, location: snapshot.person.location },
    experience: snapshot.experience,
    education: snapshot.education,
    projects: snapshot.projects,
    skills: snapshot.skills,
    optionalSections: snapshot.optionalSections,
  };
  const narrative = JSON.stringify(withoutApprovedContacts);
  const urls = narrative.match(/https?:\/\/[^\s"<>]+/gi) ?? [];
  if (urls.some((url) => !safePublicUrl(url) || new URL(url).hostname.endsWith("linkedin.com"))) {
    return "unsafe-url";
  }
  return undefined;
}

function immutableSnapshot(report: SandboxParseReport, now: Date): CareerSnapshot {
  const seed = JSON.stringify({ ...report.career, createdAt: now.toISOString() });
  const identity = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  const withoutHash = {
    ...report.career,
    id: `career:${identity}`,
    createdAt: now.toISOString(),
  };
  return careerSnapshotSchema.parse({
    ...withoutHash,
    contentHash: careerSnapshotContentHash(withoutHash),
  });
}

export class CareerIngestionService {
  readonly #store: CareerIngestionStore;
  readonly #blob: BlobUploadProvider;
  readonly #sandbox: CareerSandbox;
  readonly #contacts: AllowedContacts;
  readonly #now: () => Date;
  readonly #randomId: () => string;

  constructor(dependencies: CareerIngestionServiceDependencies) {
    this.#store = dependencies.store;
    this.#blob = dependencies.blob;
    this.#sandbox = dependencies.sandbox;
    this.#contacts = dependencies.contacts;
    this.#now = dependencies.now ?? (() => new Date());
    this.#randomId = dependencies.randomId ?? (() => crypto.randomUUID());
  }

  async issueUpload(input: {
    filename: string;
    declaredType: string;
    size: number;
    expectedHash: string;
  }): Promise<ClientUploadGrant & { intentId: string; publicProjectionWarning: string }> {
    if (!supportedType(input.declaredType)) throw new CareerIngestionError("declared-type-unsupported");
    if (!Number.isInteger(input.size) || input.size < 1 || input.size > MAXIMUM_UPLOAD_BYTES) {
      throw new CareerIngestionError("upload-too-large");
    }
    if (!safeFilename(input.filename, input.declaredType) || !/^sha256:[a-f0-9]{64}$/.test(input.expectedHash)) {
      throw new CareerIngestionError("upload-intent-invalid");
    }
    const now = this.#now();
    const intentId = `upload:${this.#randomId()}`;
    const objectKey = `raw-career/${intentId}/${input.filename}`;
    const expiresAt = new Date(now.getTime() + UPLOAD_GRANT_LIFETIME_MS);
    await this.#store.createIntent({
      id: intentId,
      filename: input.filename,
      objectKey,
      declaredType: input.declaredType,
      size: input.size,
      expectedHash: input.expectedHash,
      status: "awaiting-upload",
      createdAt: now,
      expiresAt,
    });
    let grant: ClientUploadGrant;
    try {
      grant = await this.#blob.issueClientUploadGrant({
        intentId,
        objectKey,
        contentType: input.declaredType,
        maximumBytes: input.size,
        expiresAt,
      });
    } catch {
      return this.#reject({ intentId, objectKey, code: "upload-provider-unavailable" });
    }
    let uploadUrl: URL;
    try {
      uploadUrl = new URL(grant.uploadUrl);
    } catch {
      return this.#reject({ intentId, objectKey, code: "upload-grant-invalid" });
    }
    if (
      uploadUrl.protocol !== "https:" ||
      !grant.token ||
      grant.objectKey !== objectKey ||
      grant.contentType !== input.declaredType ||
      grant.maximumBytes !== input.size ||
      grant.expiresAt.getTime() !== expiresAt.getTime()
    ) {
      return this.#reject({ intentId, objectKey, code: "upload-grant-invalid" });
    }
    return {
      ...grant,
      intentId,
      publicProjectionWarning:
        "Uploaded content is intended for public projection. Exclude employer-confidential narrative.",
    };
  }

  async #reject(input: { intentId: string; objectKey: string; code: CareerIngestionFailureCode }): Promise<never> {
    const now = this.#now();
    await this.#store.rejectAndEnqueueDeletion({
      intentId: input.intentId,
      blobKey: input.objectKey,
      failureCode: input.code,
      now,
      deletionDeadline: new Date(now.getTime() + DELETION_DEADLINE_MS),
    });
    throw new CareerIngestionError(input.code);
  }

  async completeUpload(input: {
    intentId: string;
    objectKey: string;
  }): Promise<{ decision: "accepted"; duplicate: boolean; snapshotId: string }> {
    const intent = await this.#store.readIntent(input.intentId);
    if (!intent || intent.objectKey !== input.objectKey || intent.status !== "awaiting-upload") {
      throw new CareerIngestionError("upload-intent-invalid");
    }
    if (intent.expiresAt.getTime() <= this.#now().getTime()) {
      return this.#reject({ ...input, code: "upload-intent-expired" });
    }
    await this.#store.markProcessing(intent.id);
    let untrustedReport: unknown;
    try {
      untrustedReport = await this.#sandbox.parse({
        blobKey: intent.objectKey,
        declaredType: intent.declaredType as SupportedCareerDocumentType,
        expectedHash: intent.expectedHash,
        parser: CAREER_PARSER_IDENTITY,
        policy: CAREER_SANDBOX_POLICY,
      });
    } catch {
      return this.#reject({ ...input, code: "sandbox-unavailable" });
    }
    const parsedReport = sandboxParseReportSchema.safeParse(untrustedReport);
    if (!parsedReport.success) return this.#reject({ ...input, code: "sandbox-report-invalid" });
    const report = parsedReport.data;
    const failure = reportFailure(report, intent) ??
      careerInvariantFailure(report.career, intent.expectedHash) ??
      contactFailure(report.career, this.#contacts);
    if (failure) return this.#reject({ ...input, code: failure });

    let snapshot: CareerSnapshot;
    try {
      snapshot = immutableSnapshot(report, this.#now());
    } catch {
      return this.#reject({ ...input, code: "normalization-invalid" });
    }
    const now = this.#now();
    const installed = await this.#store.installAndEnqueueDeletion({
      intentId: intent.id,
      blobKey: intent.objectKey,
      snapshot,
      now,
      deletionDeadline: new Date(now.getTime() + DELETION_DEADLINE_MS),
    });
    return { decision: "accepted", ...installed };
  }
}
