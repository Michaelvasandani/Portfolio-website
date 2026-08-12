import { describe, expect, it } from "vitest";

import { runWithBoundedRetries } from "./retry";

describe("bounded GitHub retries", () => {
  it("stops after success and records the attempt count", async () => {
    const waits: number[] = [];
    const result = await runWithBoundedRetries(
      async (attempt) => attempt < 2 ? new Response(null, { status: 503 }) : new Response(null, { status: 200 }),
      (response) => response.status >= 500,
      { maxAttempts: 3, initialDelayMs: 100, wait: async (delay) => { waits.push(delay); } },
    );

    expect(result).toMatchObject({ attempts: 2, error: null });
    expect(result.value?.status).toBe(200);
    expect(waits).toEqual([100]);
  });

  it("bounds thrown failures and returns the last error", async () => {
    let attempts = 0;
    const result = await runWithBoundedRetries(
      async () => {
        attempts += 1;
        throw new Error(`failure-${attempts}`);
      },
      () => false,
      { maxAttempts: 3, initialDelayMs: 1, wait: async () => undefined },
    );

    expect(attempts).toBe(3);
    expect(result).toMatchObject({ value: null, attempts: 3 });
    expect(result.error).toMatchObject({ message: "failure-3" });
  });
});
