import { describe, expect, it } from "vitest";

import { sha256 } from "../github/canonical";
import { evaluateRunbookExercise, monitorContinuity } from "./continuity";

describe("continued-operation monitors", () => {
  it("detects missed collection and stale or unconfigured backup without treating unknown state as healthy", () => {
    const now = new Date("2026-08-12T22:00:00.000Z");
    const report = monitorContinuity({
      now,
      lastGithubCollectionAt: new Date(now.getTime() - 86_400_001),
      maximumCollectionAgeMilliseconds: 86_400_000,
      backup: { checkedAt: new Date(now.getTime() - 604_800_001), maximumAgeMilliseconds: 604_800_000, pointInTimeRecovery: false },
      oldestPendingEffectAt: new Date(now.getTime() - 3_600_001),
      maximumPendingEffectAgeMilliseconds: 3_600_000,
    });

    expect(report.status).toBe("action-required");
    expect(report.findings.map(({ code }) => code)).toEqual([
      "missed-github-collection", "backup-status-stale", "point-in-time-recovery-unconfigured", "outbox-reconciliation-stuck",
    ]);
    expect(report.notifications.map(({ kind }) => kind)).toEqual(["missed-github-collection", "stuck-reconciliation", "stuck-reconciliation"]);
  });

  it("reports healthy only when collection, backup/PITR, and pending-effect ages are explicitly current", () => {
    const now = new Date("2026-08-12T22:00:00.000Z");
    expect(monitorContinuity({
      now,
      lastGithubCollectionAt: now,
      maximumCollectionAgeMilliseconds: 86_400_000,
      backup: { checkedAt: now, maximumAgeMilliseconds: 604_800_000, pointInTimeRecovery: true },
      oldestPendingEffectAt: null,
      maximumPendingEffectAgeMilliseconds: 3_600_000,
    })).toMatchObject({ status: "healthy", findings: [], notifications: [] });
  });
});

describe("runbook exercise evidence", () => {
  it("produces an operator-readable timeline and validates database, provider, public hash, outbox, notification, and backup state", () => {
    const hash = sha256("public-output");
    const result = evaluateRunbookExercise({
      exerciseId: "exercise:controlled-recovery",
      database: { servedDeploymentId: "deployment:prior", publicOutputHash: hash, breaker: "open" },
      provider: { servedDeploymentId: "deployment:prior" },
      publicObservation: { publicOutputHash: hash, checkedAt: "2026-08-12T22:02:00.000Z" },
      outbox: { pending: 0, failed: 0 },
      notification: { ledgerState: "delivered", providerMessageId: "resend:one" },
      backup: { state: "healthy", pointInTimeRecovery: true },
      events: [
        { at: "2026-08-12T22:00:00.000Z", actor: "recovery-worker", event: "objective failure confirmed" },
        { at: "2026-08-12T22:01:00.000Z", actor: "recovery-worker", event: "prior Valid route verified" },
        { at: "2026-08-12T22:02:00.000Z", actor: "notification-worker", event: "notification reconciled" },
      ],
    });

    expect(result.status).toBe("passed");
    expect(result.discrepancies).toEqual([]);
    expect(result.timeline).toEqual([
      "2026-08-12T22:00:00.000Z · recovery-worker · objective failure confirmed",
      "2026-08-12T22:01:00.000Z · recovery-worker · prior Valid route verified",
      "2026-08-12T22:02:00.000Z · notification-worker · notification reconciled",
    ]);
  });

  it("fails the exercise rather than claiming recovery when provider or public state disagrees", () => {
    const result = evaluateRunbookExercise({
      exerciseId: "exercise:mismatch",
      database: { servedDeploymentId: "deployment:prior", publicOutputHash: sha256("expected"), breaker: "open" },
      provider: { servedDeploymentId: "deployment:failed" },
      publicObservation: { publicOutputHash: sha256("actual"), checkedAt: "2026-08-12T22:02:00.000Z" },
      outbox: { pending: 1, failed: 1 },
      notification: { ledgerState: "pending", providerMessageId: null },
      backup: { state: "unknown", pointInTimeRecovery: false },
      events: [],
    });

    expect(result.status).toBe("failed");
    expect(result.discrepancies).toEqual(expect.arrayContaining([
      "database-provider-served-deployment-mismatch",
      "database-public-output-hash-mismatch",
      "outbox-not-converged",
      "notification-not-reconciled",
      "backup-not-verified",
      "operator-timeline-empty",
    ]));
  });
});
