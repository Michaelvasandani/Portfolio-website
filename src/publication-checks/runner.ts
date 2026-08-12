import { canonicalJson, sha256 } from "../github/canonical";
import { NORMATIVE_CONFIG_HASH, loadNormativeConfiguration } from "./config";
import { immutableTargetIdentity } from "./preview";
import type { CheckEvidence, CheckOutcome, ImmutablePreviewTarget, NormativeConfiguration, PublicationChecker, PublicationCheckRun } from "./contracts";

export type CheckClock = { now(): string };

async function withTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("checker-attempt-timed-out")), milliseconds);
  });
  try { return await Promise.race([operation, timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function runPublicationChecks(
  target: ImmutablePreviewTarget,
  configuration: NormativeConfiguration,
  checkers: PublicationChecker[],
  clock: CheckClock = { now: () => new Date().toISOString() },
): Promise<PublicationCheckRun> {
  loadNormativeConfiguration(configuration, NORMATIVE_CONFIG_HASH);
  const targetIdentity = immutableTargetIdentity(target);
  const checks: CheckEvidence[] = [];
  for (const pinned of configuration.checkers) {
    const matches = checkers.filter(({ definition }) => definition.id === pinned.id);
    const checker = matches[0];
    const startedAt = clock.now();
    const definitionMatches = checker && checker.definition.version === pinned.version
      && checker.definition.ruleset === pinned.ruleset && checker.definition.classification === pinned.classification;
    if (!checker || matches.length !== 1 || !definitionMatches) {
      const integrity = checker ? "contradictory" : "missing";
      checks.push({
        checkerId: pinned.id,
        checkIdentity: sha256(canonicalJson({ checker: pinned, configurationHash: NORMATIVE_CONFIG_HASH, targetIdentity })),
        checkerVersion: pinned.version,
        ruleset: pinned.ruleset,
        configurationHash: NORMATIVE_CONFIG_HASH,
        target: target.preview.origin,
        targetIdentity,
        startedAt,
        finishedAt: clock.now(),
        outcome: "blocked",
        classification: pinned.classification,
        integrity,
        measurements: { configuredExactlyOnce: matches.length === 1, definitionMatches: Boolean(definitionMatches) },
        attempts: [],
        reportPointer: null,
        retentionClass: "compact-one-year",
      });
      continue;
    }
    const attempts: CheckEvidence["attempts"] = [];
    let execution: Awaited<ReturnType<ReturnType<PublicationChecker["createAttempt"]>["run"]>> | undefined;
    for (let index = 0; index <= configuration.retry.maximumRetries; index += 1) {
      const cleanEnvironmentId = sha256(canonicalJson({ targetIdentity, checker: checker.definition.id, attempt: index + 1 }));
      try {
        const attempt = checker.createAttempt();
        execution = await withTimeout(
          attempt.run(target, { attempt: index + 1, cleanEnvironmentId, configurationHash: NORMATIVE_CONFIG_HASH, configuration }),
          configuration.retry.attemptTimeoutMs,
        );
      } catch (error) {
        execution = { integrity: error instanceof Error && error.message === "checker-attempt-timed-out" ? "timed-out" : "crashed", measurements: {}, reportPointer: null, targetIdentity };
      }
      if (execution.targetIdentity !== targetIdentity) execution = { ...execution, integrity: "stale" };
      attempts.push({ attempt: index + 1, cleanEnvironmentId, integrity: execution.integrity, reportPointer: execution.reportPointer });
      if (execution.integrity === "valid") break;
    }
    const integrity = execution?.integrity ?? "missing";
    const outcome: CheckOutcome = integrity === "valid" && execution?.outcome
      ? execution.outcome
      : "blocked";
    checks.push({
      checkerId: checker.definition.id,
      checkIdentity: sha256(canonicalJson({ checker: checker.definition, configurationHash: NORMATIVE_CONFIG_HASH, targetIdentity })),
      checkerVersion: checker.definition.version,
      ruleset: checker.definition.ruleset,
      configurationHash: NORMATIVE_CONFIG_HASH,
      target: target.preview.origin,
      targetIdentity,
      startedAt,
      finishedAt: clock.now(),
      outcome,
      classification: checker.definition.classification,
      integrity,
      measurements: execution?.measurements ?? {},
      attempts,
      reportPointer: execution?.reportPointer ?? null,
      retentionClass: "compact-one-year",
    });
  }

  const byId = new Map(checks.map((check) => [check.checkerId, check]));
  for (const checker of checkers) {
    const check = byId.get(checker.definition.id)!;
    if (!check) continue;
    for (const otherId of checker.definition.contradicts) {
      const other = byId.get(otherId);
      if (other && other.outcome !== check.outcome) {
        check.outcome = other.outcome = "blocked";
        check.integrity = other.integrity = "contradictory";
      }
    }
  }
  const outcome: CheckOutcome = checks.some(({ outcome }) => outcome === "blocked")
    ? "blocked"
    : checks.some(({ outcome }) => outcome === "warning") ? "warning" : "passed";
  return {
    outcome,
    checks,
    evidence: {
      schemaVersion: 1,
      configurationHash: NORMATIVE_CONFIG_HASH,
      candidateHash: target.candidate.hashes.candidateHash,
      manifestHash: target.candidate.publicManifestHash,
      publicOutputHash: target.candidate.hashes.publicOutputHash,
      deploymentId: target.preview.deploymentId,
      retentionClass: "compact-one-year",
    },
  };
}
