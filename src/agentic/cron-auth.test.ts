import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "./cron-auth";

describe("agent refresh authorization", () => {
  it("accepts only an exact bearer secret", () => {
    expect(isAuthorizedCronRequest(new Request("https://portfolio.test", {
      headers: { authorization: "Bearer a-secure-secret" },
    }), "a-secure-secret")).toBe(true);
    expect(isAuthorizedCronRequest(new Request("https://portfolio.test", {
      headers: { authorization: "Bearer wrong" },
    }), "a-secure-secret")).toBe(false);
    expect(isAuthorizedCronRequest(new Request("https://portfolio.test"), "a-secure-secret")).toBe(false);
    expect(isAuthorizedCronRequest(new Request("https://portfolio.test"), undefined)).toBe(false);
  });
});
