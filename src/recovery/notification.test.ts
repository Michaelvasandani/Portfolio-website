import { describe, expect, it } from "vitest";

import { ProductionAdapterUnavailableError } from "../publication/contracts";
import {
  FailClosedResendPort,
  InMemoryNotificationOutbox,
  InMemoryResendPort,
  NotificationWorker,
  RecoveryNotificationWorker,
} from "./notification";
import { sha256 } from "../github/canonical";
import { ManualPublicationClock } from "../publication/clock";
import { InMemoryRecoveryProvider, InMemoryRecoveryStore, RecoveryCoordinator } from "./service";

describe("notification ledger worker", () => {
  it("allows only actionable events and coalesces duplicate transactional intents", async () => {
    const ledger = new InMemoryNotificationOutbox();
    await expect(ledger.record({ kind: "routine-success" as never, subject: "success", details: "no action", now: new Date() })).rejects.toThrow("notification-kind-not-actionable");

    const first = await ledger.record({ kind: "missed-github-collection", subject: "Collection missed", details: "Last collection exceeded the daily window.", now: new Date("2026-08-12T22:00:00.000Z") });
    const duplicate = await ledger.record({ kind: "missed-github-collection", subject: "Collection missed", details: "Last collection exceeded the daily window.", now: new Date("2026-08-12T22:01:00.000Z") });

    expect(duplicate.id).toBe(first.id);
    expect((await ledger.snapshot()).outbox).toHaveLength(1);
  });

  it("reconciles an ambiguous Resend response and delivers one ledger-backed message", async () => {
    const ledger = new InMemoryNotificationOutbox();
    const resend = new InMemoryResendPort({ ambiguousResponses: 1 });
    const worker = new NotificationWorker({ ledger, resend });
    const record = await ledger.record({ kind: "rollback-failure", subject: "Rollback failed", details: "Keep the breaker open and inspect provider routing.", now: new Date("2026-08-12T22:00:00.000Z") });

    await worker.dispatchNext("worker:one", new Date("2026-08-12T22:00:01.000Z"));
    await worker.dispatchNext("worker:two", new Date("2026-08-12T22:00:02.000Z"));
    const state = await ledger.snapshot();

    expect(resend.deliveries).toEqual([{ idempotencyKey: record.idempotencyKey, subject: "Rollback failed" }]);
    expect(state.notifications).toEqual([expect.objectContaining({ id: record.id, state: "delivered", providerMessageId: expect.stringMatching(/^resend:/) })]);
    expect(state.outbox).toEqual([expect.objectContaining({ state: "applied", providerReference: state.notifications[0]!.providerMessageId })]);
  });

  it("delivers the exact notification created transactionally by recovery", async () => {
    const clock = new ManualPublicationClock();
    const prior = { id: "deployment:prior", providerDeploymentId: "provider:prior", state: "valid" as const, precedingValidDeploymentId: null, candidateHash: sha256("candidate:prior"), manifestHash: sha256("manifest:prior"), publicOutputHash: sha256("output:prior"), careerSnapshotId: "career:prior", createdAt: clock.now().toISOString() };
    const failed = { ...prior, id: "deployment:failed", providerDeploymentId: "provider:failed", precedingValidDeploymentId: prior.id, candidateHash: sha256("candidate:failed") };
    const store = new InMemoryRecoveryStore({ deployments: [prior, failed], servedDeploymentId: failed.id });
    const provider = new InMemoryRecoveryProvider({ deployments: [prior, failed], servedDeploymentId: failed.id });
    await new RecoveryCoordinator({ store, provider, clock }).recover([{
      deploymentId: failed.id,
      kind: "manifest-hash",
      probeIdentity: "probe:hash",
      observedAt: clock.now().toISOString(),
      check: { checkerId: "candidate-identity", checkerVersion: "1.0.0", configurationHash: sha256("config"), target: failed.id, startedAt: clock.now().toISOString(), finishedAt: clock.now().toISOString(), outcome: "failed", measurements: { match: false }, retryHistory: [], reportPointer: "memory://failure/hash" },
    }]);
    const resend = new InMemoryResendPort({ ambiguousResponses: 1 });

    await new RecoveryNotificationWorker({ store, resend }).dispatchNext("notification-worker", clock.now());
    const state = await store.snapshot();

    expect(state.notifications).toEqual([expect.objectContaining({ state: "delivered", providerMessageId: expect.stringMatching(/^resend:/) })]);
    expect(state.outbox.find(({ effect }) => effect === "notification")).toMatchObject({ state: "applied", providerReference: state.notifications[0]!.providerMessageId });
    expect(resend.deliveries).toHaveLength(1);
  });

  it("fails closed when live Resend resources are unavailable", async () => {
    const resend = new FailClosedResendPort();
    await expect(resend.read("notification:key")).rejects.toBeInstanceOf(ProductionAdapterUnavailableError);
    await expect(resend.send({ idempotencyKey: "notification:key", subject: "Failure", details: "Action required" })).rejects.toBeInstanceOf(ProductionAdapterUnavailableError);
  });
});
