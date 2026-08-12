import { describe, expect, it } from "vitest";

import { evaluateGitHubFreshness, reconcileMissedGitHubSchedule } from "./freshness";

describe("GitHub freshness and missed schedules", () => {
  it("allows a snapshot exactly 48 hours old and blocks anything older", () => {
    const now = new Date("2026-08-12T10:00:00.000Z");
    expect(evaluateGitHubFreshness("2026-08-10T10:00:00.000Z", now).promotionEligible).toBe(true);
    expect(evaluateGitHubFreshness("2026-08-10T09:59:59.999Z", now)).toMatchObject({
      state: "stale",
      promotionEligible: false,
      lastValidServable: true,
    });
  });

  it("creates one notification intent only after a missed daily collection", async () => {
    const intents: string[] = [];
    const store = {
      latestAttemptAt: async () => "2026-08-10T09:17:00.000Z",
      enqueueNotificationOutbox: async (idempotencyKey: string) => {
        if (intents.includes(idempotencyKey)) return false;
        intents.push(idempotencyKey);
        return true;
      },
    };

    const first = await reconcileMissedGitHubSchedule(store, new Date("2026-08-12T16:00:00.000Z"));
    const second = await reconcileMissedGitHubSchedule(store, new Date("2026-08-12T16:01:00.000Z"));

    expect(first).toMatchObject({ state: "missed", notificationCreated: true });
    expect(second).toMatchObject({ state: "missed", notificationCreated: false });
    expect(intents).toHaveLength(1);
  });
});
