import { describe, expect, it } from "vitest";

import { createFixtureMatrix, createPositiveFixture } from "./fixtures";
import { runPublicationChecks } from "./runner";

describe("executable Publication checks", () => {
  it("passes every locally executable blocking check for the positive immutable preview", async () => {
    const fixture = createPositiveFixture();
    const result = await runPublicationChecks(fixture.target, fixture.configuration, fixture.checkers, fixture.clock);

    expect(result.outcome).toBe("passed");
    expect(result.checks).toHaveLength(fixture.inventory.length);
    expect(result.checks.filter(({ classification }) => classification === "blocking").every(({ outcome }) => outcome === "passed")).toBe(true);
  });

  it.each(createFixtureMatrix())("classifies $requirement/$name as $expected", async ({ fixture, checkId, expected }) => {
    const result = await runPublicationChecks(fixture.target, fixture.configuration, fixture.checkers, fixture.clock);
    expect(result.checks.find(({ checkerId }) => checkerId === checkId)?.outcome).toBe(expected);
    expect(result.outcome).toBe(expected === "blocked" ? "blocked" : expected === "warning" ? "warning" : "passed");
  });

  it("binds the adapter to immutable candidate, manifest, deployment, and public-output hashes", () => {
    const { target } = createPositiveFixture();
    expect(Object.isFrozen(target)).toBe(true);
    expect(target.preview).toMatchObject({ zeroTraffic: true, productionShaped: true });
    expect(target.preview.candidateHash).toBe(target.candidate.hashes.candidateHash);
    expect(target.preview.manifestHash).toBe(target.candidate.publicManifestHash);
    expect(target.preview.publicOutputHash).toBe(target.candidate.hashes.publicOutputHash);
  });

  it("treats malformed or incomplete checker measurements as integrity failures", async () => {
    const fixture = createPositiveFixture();
    const observations = structuredClone(fixture.target.preview.observations);
    observations.performance.measurements = { medianScore: "100" } as never;
    const target = { ...fixture.target, preview: { ...fixture.target.preview, observations } };

    const result = await runPublicationChecks(target, fixture.configuration, fixture.checkers, fixture.clock);

    expect(result.checks.find(({ checkerId }) => checkerId === "performance")).toMatchObject({
      outcome: "blocked",
      integrity: "contradictory",
      attempts: [{ attempt: 1 }, { attempt: 2 }, { attempt: 3 }],
    });
  });
});
