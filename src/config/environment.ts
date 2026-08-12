import { z } from "zod";

const environmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "preview", "production"]),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    PRIVATE_BLOB_TOKEN: z.string().startsWith("vercel_blob_rw_").min(24),
    GITHUB_INGESTION_SECRET: z.string().min(32),
    MODEL_API_KEY: z.string().min(24),
    RESEND_API_KEY: z.string().startsWith("re_").min(24),
    VERCEL_CONTROL_TOKEN: z.string().min(24),
    PUBLIC_ORIGIN: z.url(),
  })
  .superRefine((environment, context) => {
    const origin = new URL(environment.PUBLIC_ORIGIN);
    const remoteEnvironment = environment.APP_ENV === "preview" || environment.APP_ENV === "production";
    if (remoteEnvironment && origin.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_ORIGIN"],
        message: "PUBLIC_ORIGIN must use HTTPS outside local development and test",
      });
    }
    if (!remoteEnvironment && !["127.0.0.1", "localhost"].includes(origin.hostname)) {
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_ORIGIN"],
        message: "local environments must use a loopback PUBLIC_ORIGIN",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: Record<string, string | undefined> = process.env): Environment {
  return environmentSchema.parse(source);
}

export function testEnvironment(): Environment {
  return loadEnvironment({
    APP_ENV: "test",
    DATABASE_URL: "postgresql://portfolio_test:local-only@127.0.0.1:5432/portfolio_test",
    PRIVATE_BLOB_TOKEN: "vercel_blob_rw_test_local_only",
    GITHUB_INGESTION_SECRET: "test-only-github-ingestion-secret-value",
    MODEL_API_KEY: "test-only-model-api-key-value",
    RESEND_API_KEY: "re_test_only_resend_api_key_value",
    VERCEL_CONTROL_TOKEN: "test-only-vercel-control-token",
    PUBLIC_ORIGIN: "http://127.0.0.1:3100",
  });
}
