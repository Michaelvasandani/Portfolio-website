import { afterEach, describe, expect, it, vi } from "vitest";

import { NORMATIVE_CONFIG_HASH, loadNormativeConfiguration } from "./config";
import { createPositiveFixture } from "./fixtures";
import { runPublicationChecks } from "./runner";
import type { PublicationChecker } from "./contracts";
import { immutableTargetIdentity } from "./preview";

describe("publication checker integrity", () => {
  afterEach(() => vi.useRealTimers());
  it("rejects a configuration changed without the pinned normative hash", () => {
    const changed = createPositiveFixture().configuration;
    changed.thresholds.performance.minimumMedianScore = 0;

    expect(() => loadNormativeConfiguration(changed, NORMATIVE_CONFIG_HASH)).toThrow(/normative configuration hash/i);
  });

  it.each(["crashed", "timed-out", "missing", "stale"] as const)(
    "retries a %s checker at most twice in clean attempts and then fails closed",
    async (integrity) => {
      const fixture = createPositiveFixture();
      const attemptContexts: string[] = [];
      const checker: PublicationChecker = {
        definition: fixture.inventory[0]!,
        createAttempt: () => ({ run: async (target, context) => {
          attemptContexts.push(context.cleanEnvironmentId);
          return { integrity, measurements: {}, reportPointer: null, targetIdentity: immutableTargetIdentity(target) };
        } }),
      };

      const result = await runPublicationChecks(fixture.target, fixture.configuration, [checker], fixture.clock);

      expect(attemptContexts).toHaveLength(3);
      expect(new Set(attemptContexts).size).toBe(3);
      expect(result.outcome).toBe("blocked");
      expect(result.checks[0]).toMatchObject({ outcome: "blocked", attempts: [{ attempt: 1 }, { attempt: 2 }, { attempt: 3 }] });
    },
  );

  it("fails closed when blocking results contradict each other", async () => {
    const fixture = createPositiveFixture();
    const first: PublicationChecker = {
      definition: { ...fixture.inventory[0]!, id: "candidate-identity", contradicts: ["manifest-hash"] },
      createAttempt: () => ({ run: async (target) => ({ integrity: "valid", outcome: "passed", measurements: { candidateHashMatches: true }, reportPointer: "memory://identity", targetIdentity: immutableTargetIdentity(target) }) }),
    };
    const second: PublicationChecker = {
      definition: { ...fixture.inventory[1]!, id: "manifest-hash", contradicts: ["candidate-identity"] },
      createAttempt: () => ({ run: async (target) => ({ integrity: "valid", outcome: "blocked", measurements: { candidateHashMatches: false }, reportPointer: "memory://manifest", targetIdentity: immutableTargetIdentity(target) }) }),
    };

    const result = await runPublicationChecks(fixture.target, fixture.configuration, [first, second], fixture.clock);

    expect(result.outcome).toBe("blocked");
    expect(result.checks.every(({ outcome }) => outcome === "blocked")).toBe(true);
    expect(result.checks.slice(0, 2).every(({ integrity }) => integrity === "contradictory")).toBe(true);
  });

  it("reproduces check identities and essential measurements for identical immutable inputs", async () => {
    const fixture = createPositiveFixture();
    const first = await runPublicationChecks(fixture.target, fixture.configuration, fixture.checkers, fixture.clock);
    const second = await runPublicationChecks(fixture.target, fixture.configuration, fixture.checkers, fixture.clock);

    expect(first.checks.map(({ checkIdentity, measurements }) => ({ checkIdentity, measurements }))).toEqual(
      second.checks.map(({ checkIdentity, measurements }) => ({ checkIdentity, measurements })),
    );
    expect(first.evidence).toMatchObject({ schemaVersion: 1, retentionClass: "compact-one-year", configurationHash: NORMATIVE_CONFIG_HASH });
  });

  it("times out hung attempts and creates a fresh checker instance for every retry", async () => {
    vi.useFakeTimers();
    const fixture = createPositiveFixture();
    let instances = 0;
    const checker: PublicationChecker = {
      definition: fixture.inventory[0]!,
      createAttempt: () => {
        instances += 1;
        return { run: async () => new Promise(() => undefined) };
      },
    };

    const pending = runPublicationChecks(fixture.target, fixture.configuration, [checker], fixture.clock);
    await vi.advanceTimersByTimeAsync(90_000);
    const result = await pending;

    expect(instances).toBe(3);
    expect(result.checks[0]).toMatchObject({ outcome: "blocked", integrity: "timed-out" });
  });
});
