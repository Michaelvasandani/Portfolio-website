import "server-only";

import { z } from "zod";

import type { OwnerAccessConfiguration } from "./service";

const ownerAccessEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "preview", "production"]),
    PUBLIC_ORIGIN: z.url(),
    GITHUB_APP_CLIENT_ID: z.string().min(1),
    GITHUB_APP_CLIENT_SECRET: z.string().min(32),
    GITHUB_OWNER_NUMERIC_ID: z.string().regex(/^\d+$/),
    OWNER_SESSION_SECRET: z.string().min(32),
    NEXT_PUBLIC_GITHUB_APP_CLIENT_SECRET: z.never().optional(),
    NEXT_PUBLIC_GITHUB_OWNER_NUMERIC_ID: z.never().optional(),
    NEXT_PUBLIC_OWNER_SESSION_SECRET: z.never().optional(),
  })
  .superRefine((value, context) => {
    const origin = new URL(value.PUBLIC_ORIGIN);
    const local = value.APP_ENV === "development" || value.APP_ENV === "test";
    if (!local && origin.protocol !== "https:") {
      context.addIssue({ code: "custom", path: ["PUBLIC_ORIGIN"], message: "remote owner access requires HTTPS" });
    }
    if (local && !["127.0.0.1", "localhost"].includes(origin.hostname)) {
      context.addIssue({ code: "custom", path: ["PUBLIC_ORIGIN"], message: "local owner access requires loopback" });
    }
    if (origin.pathname !== "/" || origin.search || origin.hash || value.PUBLIC_ORIGIN !== origin.origin) {
      context.addIssue({ code: "custom", path: ["PUBLIC_ORIGIN"], message: "owner access requires an exact origin" });
    }
  });

export type LoadedOwnerAccessConfiguration = OwnerAccessConfiguration & {
  environment: "development" | "test" | "preview" | "production";
  clientSecret: string;
};

export function loadOwnerAccessConfiguration(
  source: Record<string, string | undefined>,
): LoadedOwnerAccessConfiguration {
  const value = ownerAccessEnvironmentSchema.parse(source);
  return {
    environment: value.APP_ENV,
    publicOrigin: value.PUBLIC_ORIGIN,
    callbackUrl: `${value.PUBLIC_ORIGIN}/api/auth/github/callback`,
    clientId: value.GITHUB_APP_CLIENT_ID,
    clientSecret: value.GITHUB_APP_CLIENT_SECRET,
    ownerNumericId: value.GITHUB_OWNER_NUMERIC_ID,
    sessionSecret: value.OWNER_SESSION_SECRET,
    oauthLifetimeSeconds: 300,
    sessionLifetimeSeconds: 900,
  };
}
