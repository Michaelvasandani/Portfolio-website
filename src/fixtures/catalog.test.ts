import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseFixtureCatalog } from "./catalog";

const rawCatalog = JSON.parse(readFileSync(new URL("../../fixtures/v1/catalog.json", import.meta.url), "utf8"));
const expectedIds = [
  ...Array.from({ length: 12 }, (_, index) => `CAR-V1-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `GIT-V1-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 9 }, (_, index) => `SEL-V1-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 5 }, (_, index) => `GEN-V1-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 4 }, (_, index) => `RND-V1-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `CHK-V1-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 9 }, (_, index) => `PUB-V1-${String(index + 1).padStart(3, "0")}`),
];
const expectedDecisions = [
  "accept", "accept", "accept", "accept", "accept", "reject", "reject", "reject", "reject", "reject", "reject", "reject",
  "accept", "no-op", "reject", "preserve", "boundary", "ignore",
  "select", "select", "select", "match", "match", "unmatched", "boundary", "stabilize", "boundary",
  "accept", "fallback", "reject", "reject", "reject",
  "accept", "accept", "accept", "accept",
  "pass", "reject", "classify", "fail", "boundary", "reject",
  "serialize", "converge", "reject", "recover", "boundary", "converge", "escalate", "block-promotion", "retain",
];

describe("normative fixture catalogue", () => {
  const fixtures = parseFixtureCatalog(rawCatalog);

  it("contains every stable catalogue ID exactly once", () => {
    expect(fixtures.map(({ id }) => id)).toEqual(expectedIds);
  });

  it("records the exact freshness boundary", () => {
    expect(fixtures.find(({ id }) => id === "GIT-V1-005")?.input.snapshotAges).toEqual([
      "PT47H59M",
      "PT48H1M",
    ]);
  });

  it("records the selection stability and diversity boundaries", () => {
    expect(fixtures.find(({ id }) => id === "SEL-V1-007")?.input.challengerDeficits).toEqual([7, 9]);
    expect(fixtures.find(({ id }) => id === "SEL-V1-008")?.input).toMatchObject({
      challengerLead: 8,
      consecutiveDays: 2,
    });
  });

  it.each(fixtures.map((fixture, index) => ({ fixture, expectedDecision: expectedDecisions[index] })))(
    "$fixture.id v$fixture.version has its normative executable outcome",
    ({ fixture, expectedDecision }) => {
      expect(fixture.expected.decision).toBe(expectedDecision);
      expect(fixture.expected.assertions.length).toBeGreaterThan(0);
      expect(Object.keys(fixture.input).length).toBeGreaterThan(0);
    },
  );
});
