import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("startup environment gate", () => {
  it("fails the documented startup validator when required configuration is absent", () => {
    const result = spawnSync("pnpm", ["exec", "tsx", "scripts/validate-environment.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_ENV: undefined,
        DATABASE_URL: undefined,
        PRIVATE_BLOB_TOKEN: undefined,
        GITHUB_INGESTION_SECRET: undefined,
        MODEL_API_KEY: undefined,
        RESEND_API_KEY: undefined,
        VERCEL_CONTROL_TOKEN: undefined,
        PUBLIC_ORIGIN: undefined,
      },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/APP_ENV|DATABASE_URL/);
  });
});
