export const managedEnvironments = ["development", "preview", "production"] as const;
export type ManagedEnvironment = (typeof managedEnvironments)[number];

export const credentialRoles = [
  "database-runtime",
  "database-migration",
  "blob-runtime",
  "github-oauth",
  "github-ingestion",
  "model-generation",
  "resend-notification",
  "vercel-control",
] as const;
export type CredentialRole = (typeof credentialRoles)[number];

interface RolePolicy {
  holder: "vercel-server" | "github-actions";
  environmentVariable: string;
  allowedOperations: readonly string[];
}

export const rolePolicy: Record<CredentialRole, RolePolicy> = {
  "database-runtime": {
    holder: "vercel-server",
    environmentVariable: "DATABASE_URL",
    allowedOperations: ["connect-pooled", "read", "write"],
  },
  "database-migration": {
    holder: "vercel-server",
    environmentVariable: "DATABASE_MIGRATION_URL",
    allowedOperations: ["connect-direct", "migrate-schema"],
  },
  "blob-runtime": {
    holder: "vercel-server",
    environmentVariable: "PRIVATE_BLOB_TOKEN",
    allowedOperations: ["read-private", "write-private", "delete-private"],
  },
  "github-oauth": {
    holder: "vercel-server",
    environmentVariable: "GITHUB_APP_CLIENT_SECRET",
    allowedOperations: ["oauth-user-identity"],
  },
  "github-ingestion": {
    holder: "github-actions",
    environmentVariable: "GITHUB_INGESTION_SECRET",
    allowedOperations: ["submit-signed-snapshot"],
  },
  "model-generation": {
    holder: "vercel-server",
    environmentVariable: "MODEL_API_KEY",
    allowedOperations: ["generate-structured-output"],
  },
  "resend-notification": {
    holder: "vercel-server",
    environmentVariable: "RESEND_API_KEY",
    allowedOperations: ["send-actionable-email"],
  },
  "vercel-control": {
    holder: "vercel-server",
    environmentVariable: "VERCEL_CONTROL_TOKEN",
    allowedOperations: ["read-deployment", "create-deployment", "promote-deployment"],
  },
};

export const requiredSignoffStatement =
  "All provisioning checklist items are complete; no credential value is present in evidence.";
