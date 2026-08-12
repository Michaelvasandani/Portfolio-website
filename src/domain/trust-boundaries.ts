import { createHash } from "node:crypto";

import { z } from "zod";

import { isoDateTimeSchema, sha256Schema } from "./primitives";

export type SourceAuthority = "career" | "github" | "presentation";

const authorityPrefixes: readonly [prefix: string, authority: SourceAuthority][] = [
  ["person.", "career"],
  ["experience.", "career"],
  ["education.", "career"],
  ["skills.", "career"],
  ["projects.", "career"],
  ["optionalSections.", "career"],
  ["repositories.", "github"],
  ["selection.", "presentation"],
  ["metadata.", "presentation"],
  ["framing.", "presentation"],
];

export function sourceAuthorityFor(fieldPath: string): SourceAuthority {
  const match = authorityPrefixes.find(([prefix]) => fieldPath.startsWith(prefix));
  if (!match) {
    throw new Error(`No source authority is defined for ${fieldPath}`);
  }
  return match[1];
}

export type SourceAssertion = {
  fieldPath: string;
  authority: SourceAuthority;
  objectiveValue: string;
  historicalAt?: string;
};

export function rejectMaterialSourceConflicts(assertions: readonly SourceAssertion[]): true {
  const currentValues = new Map<string, string>();
  for (const assertion of assertions) {
    const expectedAuthority = sourceAuthorityFor(assertion.fieldPath);
    if (assertion.authority !== expectedAuthority) {
      throw new Error(`${assertion.fieldPath} violates its ${expectedAuthority} source authority`);
    }
    if (assertion.historicalAt !== undefined) continue;
    const previous = currentValues.get(assertion.fieldPath);
    if (previous !== undefined && previous !== assertion.objectiveValue) {
      throw new Error(`Material source conflict at ${assertion.fieldPath}`);
    }
    currentValues.set(assertion.fieldPath, assertion.objectiveValue);
  }
  return true;
}

export type DisplayNormalization = {
  original: string;
  normalized: string;
  transformation: "whitespace" | "typography" | "url" | "date";
};

function normalizedTypography(value: string) {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...");
}

function normalizedUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

const monthNumbers: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

function normalizedDate(value: string) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/.exec(value.trim());
  if (match) {
    return `${match[2]}-${monthNumbers[match[1]!]}`;
  }
  return value.trim();
}

export function validateDisplayNormalization(normalization: DisplayNormalization): DisplayNormalization {
  let expected: string;
  switch (normalization.transformation) {
    case "whitespace":
      expected = normalization.original.trim().replace(/\s+/g, " ");
      break;
    case "typography":
      expected = normalizedTypography(normalization.original);
      break;
    case "url":
      expected = normalizedUrl(normalization.original);
      break;
    case "date":
      expected = normalizedDate(normalization.original);
      break;
  }

  if (expected !== normalization.normalized) {
    throw new Error(`${normalization.transformation} normalization must preserve the original meaning`);
  }
  return normalization;
}

const publicContactSchema = z
  .object({
    kind: z.enum(["email", "github", "linkedin"]),
    href: z.string().refine((href) => href.startsWith("mailto:") || href.startsWith("https://")),
    label: z.string().min(1),
  })
  .strict();

const publicExperienceSchema = z
  .object({
    organization: z.string().min(1),
    title: z.string().min(1),
    location: z.string().optional(),
    dates: z.string().min(1),
    bullets: z.array(z.string()),
  })
  .strict();

const publicProjectSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    repositoryUrl: z.url().refine((url) => url.startsWith("https://")),
    technologies: z.array(z.string()),
    bullets: z.array(z.string()),
  })
  .strict();

export const publicProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    person: z
      .object({
        name: z.string().min(1),
        location: z.string().optional(),
        contacts: z.array(publicContactSchema),
      })
      .strict(),
    sections: z.tuple([
      z.literal("card"),
      z.literal("about"),
      z.literal("experience"),
      z.literal("projects"),
      z.literal("resume"),
      z.literal("links"),
    ]),
    experience: z.array(publicExperienceSchema),
    projects: z.array(publicProjectSchema),
    resume: z
      .object({
        htmlPath: z.string().startsWith("/"),
        pdfPath: z.string().startsWith("/").endsWith(".pdf"),
      })
      .strict(),
    publicManifestHash: sha256Schema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const parsePublicProjection = publicProjectionSchema.parse;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function calculateContentHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

export function verifyContentHash(value: unknown, declaredHash: string): true {
  if (calculateContentHash(value) !== declaredHash) {
    throw new Error("Declared content hash does not match canonical content");
  }
  return true;
}

export function createIdempotencyKey(operation: string, immutableInputs: readonly string[]): string {
  if (!operation || immutableInputs.length === 0 || immutableInputs.some((input) => !input)) {
    throw new Error("Idempotency keys require an operation and immutable inputs");
  }
  return `${operation}:${calculateContentHash(immutableInputs).slice("sha256:".length)}`;
}
