import { describe, expect, it } from "vitest";

import { loadEnvironment, testEnvironment } from "./environment";

describe("environment contract", () => {
  const valid = {
    APP_ENV: "preview",
    DATABASE_URL: "postgresql://portfolio_preview:secret@db.example.com/portfolio_preview?sslmode=require",
    PRIVATE_BLOB_TOKEN: "vercel_blob_rw_preview_example_token",
    GITHUB_INGESTION_SECRET: "preview-github-secret-at-least-32-characters",
    MODEL_API_KEY: "preview-model-api-key-at-least-24",
    RESEND_API_KEY: "re_preview_api_key_at_least_24",
    VERCEL_CONTROL_TOKEN: "preview-vercel-control-token-24",
    PUBLIC_ORIGIN: "https://preview.example.com",
  };

  it("accepts a complete, well-formed environment", () => {
    expect(loadEnvironment(valid).APP_ENV).toBe("preview");
  });

  it("ignores unrelated host process variables", () => {
    expect(loadEnvironment({ ...valid, PATH: "/usr/bin" })).toEqual(valid);
  });

  it("fails startup when a required contract is absent", () => {
    const missingDatabase: Record<string, string> = { ...valid };
    delete missingDatabase.DATABASE_URL;
    expect(() => loadEnvironment(missingDatabase)).toThrow(/DATABASE_URL/);
  });

  it("fails startup when a required contract is malformed", () => {
    expect(() => loadEnvironment({ ...valid, PUBLIC_ORIGIN: "http://preview.example.com" })).toThrow(
      /PUBLIC_ORIGIN/,
    );
  });

  it("provides local test configuration without production credentials", () => {
    const environment = testEnvironment();
    expect(environment.APP_ENV).toBe("test");
    expect(JSON.stringify(environment)).not.toMatch(/production|prod_/i);
    expect(environment.DATABASE_URL).toContain("127.0.0.1");
  });
});
