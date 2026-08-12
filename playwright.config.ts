import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    env: {
      APP_ENV: "test",
      DATABASE_URL: "postgresql://portfolio_test:local-only@127.0.0.1:5432/portfolio_test",
      PRIVATE_BLOB_TOKEN: "vercel_blob_rw_test_local_only",
      GITHUB_INGESTION_SECRET: "test-only-github-ingestion-secret-value",
      MODEL_API_KEY: "test-only-model-api-key-value",
      RESEND_API_KEY: "re_test_only_resend_api_key_value",
      VERCEL_CONTROL_TOKEN: "test-only-vercel-control-token",
      PUBLIC_ORIGIN: "http://127.0.0.1:3100",
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
