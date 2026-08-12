import { describe, expect, it } from "vitest";

import { loadOwnerAccessConfiguration } from "./config";

describe("owner-access environment", () => {
  const valid = {
    APP_ENV: "production",
    PUBLIC_ORIGIN: "https://portfolio.example.com",
    GITHUB_APP_CLIENT_ID: "Iv1.example",
    GITHUB_APP_CLIENT_SECRET: "github-client-secret-at-least-32-characters",
    GITHUB_OWNER_NUMERIC_ID: "31415926",
    OWNER_SESSION_SECRET: "owner-session-secret-at-least-32-characters",
  };

  it("loads an exact callback and short server-side lifetimes", () => {
    expect(loadOwnerAccessConfiguration(valid)).toMatchObject({
      environment: "production",
      callbackUrl: "https://portfolio.example.com/api/auth/github/callback",
      ownerNumericId: "31415926",
      oauthLifetimeSeconds: 300,
      sessionLifetimeSeconds: 900,
    });
  });

  it.each([
    ["a mutable login instead of a numeric ID", { GITHUB_OWNER_NUMERIC_ID: "michael" }],
    ["a short session secret", { OWNER_SESSION_SECRET: "short" }],
    ["an insecure remote origin", { PUBLIC_ORIGIN: "http://portfolio.example.com" }],
    ["credentials prefixed for public bundling", { NEXT_PUBLIC_GITHUB_APP_CLIENT_SECRET: "leak" }],
  ])("rejects %s", (_label, override) => {
    expect(() => loadOwnerAccessConfiguration({ ...valid, ...override })).toThrow();
  });

  it("permits loopback HTTP only for local test and development", () => {
    expect(
      loadOwnerAccessConfiguration({
        ...valid,
        APP_ENV: "test",
        PUBLIC_ORIGIN: "http://127.0.0.1:3100",
      }).callbackUrl,
    ).toBe("http://127.0.0.1:3100/api/auth/github/callback");
  });
});
