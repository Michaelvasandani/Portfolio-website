import { describe, expect, it } from "vitest";

import {
  calculateContentHash,
  createIdempotencyKey,
  parsePublicProjection,
  rejectMaterialSourceConflicts,
  sourceAuthorityFor,
  validateDisplayNormalization,
  verifyContentHash,
} from "./trust-boundaries";

describe("source authority", () => {
  it.each([
    ["person.name", "career"],
    ["experience.0.title", "career"],
    ["projects.0.name", "career"],
    ["repositories.0.releases", "github"],
    ["repositories.0.url", "github"],
    ["selection.order", "presentation"],
    ["metadata.description", "presentation"],
  ] as const)("assigns %s to %s", (fieldPath, authority) => {
    expect(sourceAuthorityFor(fieldPath)).toBe(authority);
  });

  it("rejects an unknown authority path", () => {
    expect(() => sourceAuthorityFor("linkedin.experience")).toThrow(/authority/i);
  });

  it("rejects conflicting current objective facts", () => {
    expect(() =>
      rejectMaterialSourceConflicts([
        { fieldPath: "projects.0.name", authority: "career", objectiveValue: "Portfolio" },
        { fieldPath: "projects.0.name", authority: "career", objectiveValue: "Personal site" },
      ]),
    ).toThrow(/material source conflict/i);
  });

  it("permits explicitly dated historical states", () => {
    expect(
      rejectMaterialSourceConflicts([
        { fieldPath: "experience.0.title", authority: "career", objectiveValue: "Engineer", historicalAt: "2024" },
        { fieldPath: "experience.0.title", authority: "career", objectiveValue: "Senior Engineer" },
      ]),
    ).toBe(true);
  });
});

describe("Display normalization", () => {
  it.each([
    ["  dependable   systems ", "dependable systems", "whitespace"],
    ["Engineer’s toolkit", "Engineer's toolkit", "typography"],
    ["https://example.com/", "https://example.com", "url"],
    ["Aug 2026", "2026-08", "date"],
  ] as const)("accepts meaning-preserving %s normalization", (original, normalized, transformation) => {
    expect(validateDisplayNormalization({ original, normalized, transformation })).toEqual({
      original,
      normalized,
      transformation,
    });
  });

  it("rejects a transformation that edits source meaning", () => {
    expect(() =>
      validateDisplayNormalization({
        original: "Built an internal prototype",
        normalized: "Built a production platform",
        transformation: "whitespace",
      }),
    ).toThrow(/preserve/i);
  });
});

describe("Public projection", () => {
  const validProjection = {
    schemaVersion: 1,
    person: {
      name: "Michael Vasandani",
      contacts: [{ kind: "email", href: "mailto:michael@example.com", label: "Email Michael" }],
    },
    sections: ["card", "about", "experience", "projects", "resume", "links"],
    experience: [],
    projects: [],
    resume: { htmlPath: "/resume", pdfPath: "/michael-vasandani-resume.pdf" },
    publicManifestHash: `sha256:${"a".repeat(64)}`,
    updatedAt: "2026-08-12T00:00:00.000Z",
  };

  it("accepts only the allowlisted public shape", () => {
    expect(parsePublicProjection(validProjection)).toEqual(validProjection);
  });

  it("rejects private fields at every strict projection boundary", () => {
    expect(() => parsePublicProjection({ ...validProjection, sourceSnapshotId: "career:private" })).toThrow();
    expect(() =>
      parsePublicProjection({
        ...validProjection,
        person: { ...validProjection.person, phone: "+1 555 555 5555" },
      }),
    ).toThrow();
  });
});

describe("hash and idempotency invariants", () => {
  it("hashes canonical content independently of object key order", () => {
    expect(calculateContentHash({ a: 1, b: 2 })).toBe(calculateContentHash({ b: 2, a: 1 }));
  });

  it("rejects content that does not match its declared hash", () => {
    expect(() => verifyContentHash({ important: true }, `sha256:${"0".repeat(64)}`)).toThrow(/hash/i);
  });

  it("derives stable, operation-scoped idempotency keys", () => {
    const first = createIdempotencyKey("promotion", ["run:one", "deployment:one"]);
    expect(first).toBe(createIdempotencyKey("promotion", ["run:one", "deployment:one"]));
    expect(first).not.toBe(createIdempotencyKey("rollback", ["run:one", "deployment:one"]));
  });
});
