const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1_000;
const MISSED_SCHEDULE_WINDOW_MS = 30 * 60 * 60 * 1_000;

export function evaluateGitHubFreshness(collectedAt: string, now = new Date()) {
  const ageMs = now.getTime() - new Date(collectedAt).getTime();
  const promotionEligible = ageMs >= 0 && ageMs <= FRESHNESS_WINDOW_MS;
  return {
    state: promotionEligible ? ("fresh" as const) : ("stale" as const),
    ageMs,
    promotionEligible,
    lastValidServable: true,
  };
}

export interface GitHubScheduleStore {
  latestAttemptAt(): Promise<string | null>;
  enqueueNotificationOutbox(idempotencyKey: string): Promise<boolean>;
}

export async function reconcileMissedGitHubSchedule(store: GitHubScheduleStore, now = new Date()) {
  const latestAttemptAt = await store.latestAttemptAt();
  const missed = latestAttemptAt === null || now.getTime() - new Date(latestAttemptAt).getTime() > MISSED_SCHEDULE_WINDOW_MS;
  if (!missed) return { state: "current" as const, notificationCreated: false };
  const day = now.toISOString().slice(0, 10);
  const notificationCreated = await store.enqueueNotificationOutbox(`github-missed-schedule:${day}`);
  return { state: "missed" as const, notificationCreated };
}
