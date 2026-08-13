import { describe, expect, it } from "vitest";

import { createOwnerAccessRuntime } from "./runtime";
import { InMemoryOwnerAccessStore } from "./store";
import { UnavailableOperationalRepository } from "../operations";

const configured = {
  APP_ENV: "production",
  PUBLIC_ORIGIN: "https://portfolio.example.com",
  GITHUB_APP_CLIENT_ID: "Iv1.example",
  GITHUB_APP_CLIENT_SECRET: "github-client-secret-at-least-32-characters",
  GITHUB_OWNER_NUMERIC_ID: "31415926",
  OWNER_SESSION_SECRET: "owner-session-secret-at-least-32-characters",
};

describe("owner-access runtime boundary", () => {
  it("fails closed when configuration is missing", () => {
    expect(createOwnerAccessRuntime({})).toEqual({
      available: false,
      reason: "Owner access is not configured.",
    });
  });

  it("refuses an ephemeral auth store in preview and production", () => {
    expect(createOwnerAccessRuntime(configured)).toEqual({
      available: false,
      reason: "Persistent owner-access storage is not connected.",
    });
  });

  it("accepts an injected persistent-store boundary for a remote environment", () => {
    const operations = new UnavailableOperationalRepository("test operations");
    const runtime = createOwnerAccessRuntime(configured, new InMemoryOwnerAccessStore(), operations);
    expect(runtime.available).toBe(true);
    if (runtime.available) {
      expect(runtime.configuration.environment).toBe("production");
      expect(runtime.operations).toBe(operations);
    }
  });

  it("uses the explicitly ephemeral store only in test and development", () => {
    const runtime = createOwnerAccessRuntime({
      ...configured,
      APP_ENV: "test",
      PUBLIC_ORIGIN: "http://127.0.0.1:3100",
    });
    expect(runtime.available).toBe(true);
  });
});
