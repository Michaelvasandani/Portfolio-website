import { describe, expect, it } from "vitest";

import {
  executeConnectionProbes,
  computeManifestSha256,
  runConnectionProbes,
  scanTextArtifacts,
  validateEnvironmentSecretNames,
  validateProvisioningManifest,
  verifyProvisioning,
  type ConnectionProbe,
  type ProvisioningManifest,
} from "./verify";

const environments = ["development", "preview", "production"] as const;
const credentialRoles = [
  "database-runtime",
  "database-migration",
  "blob-runtime",
  "github-oauth",
  "github-ingestion",
  "model-generation",
  "resend-notification",
  "vercel-control",
] as const;

function completeManifest(): ProvisioningManifest {
  return {
    schemaVersion: 1,
    reviewedBy: "pending-human-review",
    environments: environments.map((environment) => ({
      environment,
      publicOrigin: `https://${environment}.portfolio.example`,
      oauthCallback: `https://${environment}.portfolio.example/api/auth/github/callback`,
      services: {
        vercel: {
          plan: "pro",
          projectId: `vercel-project-${environment}`,
          controlCredentialId: `vercel-control-${environment}`,
        },
        database: {
          provider: "neon-marketplace",
          marketplace: "vercel-marketplace",
          resourceId: `neon-project-${environment}`,
          pooledRuntime: true,
          runtimeCredentialId: `database-runtime-${environment}`,
          migrationCredentialId: `database-migration-${environment}`,
          pointInTimeRecovery: { enabled: true, evidenceRef: `provider://neon/${environment}/pitr` },
        },
        blob: {
          resourceId: `blob-store-${environment}`,
          access: "private",
          runtimeCredentialId: `blob-runtime-${environment}`,
        },
        sandbox: {
          resourceId: `sandbox-${environment}`,
          networkDefault: "deny",
          parserImageDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          limits: {
            cpuCores: 1,
            memoryMiB: 1024,
            timeoutSeconds: 300,
            maximumFiles: 256,
            maximumExtractedBytes: 50_000_000,
          },
        },
        githubApp: {
          appId: `github-app-${environment}`,
          oauthCredentialId: `github-oauth-${environment}`,
          immutableOwnerIdSecretRef: `secret-store://vercel/${environment}/github-owner-id`,
          permissions: { metadata: "read" },
        },
        githubActions: {
          ingestionCredentialId: `github-ingestion-${environment}`,
          permissions: { contents: "read" },
          forbiddenCredentialRolesPresent: [],
        },
        model: {
          provider: "approved-provider",
          model: "structured-generation-model",
          version: "pinned-version",
          credentialId: `model-generation-${environment}`,
          structuredOutput: true,
          providerTraining: false,
          retention: "zero",
        },
        resend: {
          domain: `${environment}.mail.portfolio.example`,
          domainVerified: true,
          credentialId: `resend-notification-${environment}`,
        },
      },
    })),
    credentials: environments.flatMap((environment) =>
      credentialRoles.map((role) => ({
        id: `${role}-${environment}`,
        role,
        environment,
        holder: role === "github-ingestion" ? "github-actions" : "vercel-server",
        environmentVariable: environmentVariable(role),
        allowedOperations: allowedOperations(role),
        secretStore:
          role === "github-ingestion"
            ? `github-actions:${environment}`
            : `vercel-sensitive-env:${environment}`,
        rotationOwner: "Michael",
        revocationPath: `provider-console://${role}/revoke`,
      })),
    ),
    evidence: {
      providerSettings: environments.flatMap((environment) =>
        ["vercel", "database", "blob", "sandbox", "github-app", "model", "resend"].map(
          (provider) => ({
            environment,
            provider,
            redactedRef: `evidence://ticket-02/${environment}/${provider}`,
          }),
        ),
      ),
      humanSignoff: { status: "pending", owner: "Michael Sagar Vasandani" },
    },
  };
}

function environmentVariable(role: (typeof credentialRoles)[number]): string {
  const names: Record<(typeof credentialRoles)[number], string> = {
    "database-runtime": "DATABASE_URL",
    "database-migration": "DATABASE_MIGRATION_URL",
    "blob-runtime": "PRIVATE_BLOB_TOKEN",
    "github-oauth": "GITHUB_APP_CLIENT_SECRET",
    "github-ingestion": "GITHUB_INGESTION_SECRET",
    "model-generation": "MODEL_API_KEY",
    "resend-notification": "RESEND_API_KEY",
    "vercel-control": "VERCEL_CONTROL_TOKEN",
  };
  return names[role];
}

function allowedOperations(role: (typeof credentialRoles)[number]): string[] {
  const operations: Record<(typeof credentialRoles)[number], string[]> = {
    "database-runtime": ["connect-pooled", "read", "write"],
    "database-migration": ["connect-direct", "migrate-schema"],
    "blob-runtime": ["read-private", "write-private", "delete-private"],
    "github-oauth": ["oauth-user-identity"],
    "github-ingestion": ["submit-signed-snapshot"],
    "model-generation": ["generate-structured-output"],
    "resend-notification": ["send-actionable-email"],
    "vercel-control": ["read-deployment", "create-deployment", "promote-deployment"],
  };
  return operations[role];
}

function completeProbes(manifest: ProvisioningManifest): ConnectionProbe[] {
  return manifest.credentials.flatMap((credential) => {
    const otherEnvironment =
      credential.environment === "development" ? "preview" : "development";
    return [
      {
        id: `${credential.id}-allowed`,
        environment: credential.environment,
        credentialId: credential.id,
        targetResourceId: targetFor(manifest, credential.role, credential.environment),
        expected: "allowed",
        observed: "allowed",
        redactedLogRef: `probe://ticket-02/${credential.id}/allowed`,
      },
      {
        id: `${credential.id}-cross-environment-denied`,
        environment: otherEnvironment,
        credentialId: credential.id,
        targetResourceId: targetFor(manifest, credential.role, otherEnvironment),
        expected: "denied",
        observed: "denied",
        redactedLogRef: `probe://ticket-02/${credential.id}/denied`,
      },
    ];
  });
}

function targetFor(
  manifest: ProvisioningManifest,
  role: (typeof credentialRoles)[number],
  environment: (typeof environments)[number],
): string {
  const services = manifest.environments.find((entry) => entry.environment === environment)!.services;
  const targets: Record<(typeof credentialRoles)[number], string> = {
    "database-runtime": services.database.resourceId,
    "database-migration": services.database.resourceId,
    "blob-runtime": services.blob.resourceId,
    "github-oauth": services.githubApp.appId,
    "github-ingestion": new URL(
      "/api/internal/github-ingestion",
      manifest.environments.find((entry) => entry.environment === environment)!.publicOrigin,
    ).href,
    "model-generation": `${services.model.provider}/${services.model.model}/${services.model.version}`,
    "resend-notification": services.resend.domain,
    "vercel-control": services.vercel.projectId,
  };
  return targets[role];
}

describe("provisioning manifest contract", () => {
  it("accepts separated managed resources and a complete least-privilege matrix", () => {
    expect(validateProvisioningManifest(completeManifest())).toEqual([]);
  });

  it("fails closed when a credential or resource is shared across environments", () => {
    const manifest = completeManifest();
    manifest.environments[1]!.services.database.resourceId =
      manifest.environments[0]!.services.database.resourceId;
    manifest.credentials.find((entry) => entry.id === "model-generation-preview")!.id =
      "model-generation-development";

    expect(validateProvisioningManifest(manifest)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/database resource.*shared/i),
        expect.stringMatching(/credential id.*unique/i),
      ]),
    );
  });

  it("rejects unsafe provider configuration and overprivileged identities", () => {
    const manifest = completeManifest();
    const production = manifest.environments[2]!;
    production.services.database.pooledRuntime = false;
    production.services.blob.access = "public";
    production.services.database.pointInTimeRecovery.enabled = false;
    production.services.githubApp.permissions = { contents: "write" };
    production.services.githubActions.forbiddenCredentialRolesPresent = ["database-runtime"];
    production.services.githubActions.permissions = { contents: "write", packages: "read" };
    production.oauthCallback = "https://*.portfolio.example/api/auth/github/callback";
    production.services.model.providerTraining = true;
    production.services.resend.domainVerified = false;

    expect(validateProvisioningManifest(manifest)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/pooled/i),
        expect.stringMatching(/blob.*private/i),
        expect.stringMatching(/point-in-time recovery/i),
        expect.stringMatching(/GitHub App.*minimal/i),
        expect.stringMatching(/GitHub Actions.*forbidden/i),
        expect.stringMatching(/GitHub Actions.*contents.*read/i),
        expect.stringMatching(/callback.*exact/i),
        expect.stringMatching(/training/i),
        expect.stringMatching(/Resend domain.*verified/i),
      ]),
    );
  });

  it("runtime-parses schema version and the required Neon Vercel Marketplace integration", () => {
    const wrongVersion = { ...completeManifest(), schemaVersion: 2 };
    const wrongMarketplace = completeManifest();
    wrongMarketplace.environments[0]!.services.database.marketplace = "direct-neon";

    expect(validateProvisioningManifest(wrongVersion)).toEqual(
      expect.arrayContaining([expect.stringMatching(/schema version 1/i)]),
    );
    expect(validateProvisioningManifest(wrongMarketplace)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Neon.*Vercel Marketplace/i)]),
    );
  });

  it("requires exact HTTPS origins and callbacks without credentials, query, or fragment", () => {
    const manifest = completeManifest();
    manifest.environments[0]!.publicOrigin = "http://development.portfolio.example/path";
    manifest.environments[1]!.oauthCallback =
      "https://preview.portfolio.example/api/auth/github/callback?redirect=evil";
    manifest.environments[2]!.oauthCallback =
      "https://user@production.portfolio.example/api/auth/github/callback#fragment";

    expect(validateProvisioningManifest(manifest)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/development.*origin.*exact HTTPS/i),
        expect.stringMatching(/preview.*callback.*exact/i),
        expect.stringMatching(/production.*callback.*exact/i),
      ]),
    );
  });

  it("requires positive bounded Sandbox resource limits", () => {
    const manifest = completeManifest();
    manifest.environments[2]!.services.sandbox.limits = {
      cpuCores: 0,
      memoryMiB: 0,
      timeoutSeconds: 0,
      maximumFiles: 0,
      maximumExtractedBytes: 0,
    };

    expect(validateProvisioningManifest(manifest)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Sandbox CPU limit/i),
        expect.stringMatching(/Sandbox memory limit/i),
        expect.stringMatching(/Sandbox timeout/i),
        expect.stringMatching(/Sandbox file-count/i),
        expect.stringMatching(/Sandbox extracted-size/i),
      ]),
    );
  });

  it("returns validation errors instead of throwing for an invalid document", () => {
    expect(validateProvisioningManifest({})).toEqual(
      expect.arrayContaining([expect.stringMatching(/schema|manifest/i)]),
    );
  });

  it("requires redacted evidence for every provider setting in every environment", () => {
    const manifest = completeManifest();
    manifest.evidence.providerSettings = manifest.evidence.providerSettings.filter(
      (entry) => !(entry.environment === "production" && entry.provider === "blob"),
    );

    expect(validateProvisioningManifest(manifest)).toEqual(
      expect.arrayContaining([expect.stringMatching(/production.*blob.*evidence/i)]),
    );
  });

  it("rejects public, renamed, or duplicate secret environment variables", () => {
    const manifest = completeManifest();
    manifest.credentials.find((entry) => entry.id === "model-generation-production")!.environmentVariable =
      "NEXT_PUBLIC_MODEL_API_KEY";
    manifest.credentials.find((entry) => entry.id === "resend-notification-preview")!.environmentVariable =
      "MODEL_API_KEY";

    expect(validateProvisioningManifest(manifest)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/NEXT_PUBLIC/i),
        expect.stringMatching(/resend-notification-preview.*RESEND_API_KEY/i),
      ]),
    );
  });

  it("does not accept a bare signed flag as Michael's provisioning sign-off", () => {
    const manifest = completeManifest();
    manifest.evidence.humanSignoff = { status: "signed", owner: "Michael Sagar Vasandani" };

    expect(validateProvisioningManifest(manifest)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/signedAt/i),
        expect.stringMatching(/manifestSha256/i),
        expect.stringMatching(/sign-off statement/i),
        expect.stringMatching(/reviewer/i),
        expect.stringMatching(/evidence.*reference/i),
      ]),
    );
  });

  it("cryptographically binds a valid UTC Michael sign-off to the manifest", () => {
    const manifest = completeManifest();
    manifest.reviewedBy = "Michael Sagar Vasandani";
    manifest.evidence.humanSignoff = {
      status: "signed",
      owner: "Michael Sagar Vasandani",
      reviewer: "Michael Sagar Vasandani",
      signedAt: "2026-08-12T20:00:00.000Z",
      evidenceRef: "private-evidence://ticket-02/final-signoff",
      manifestSha256: "pending-computation",
      statement: "All provisioning checklist items are complete; no credential value is present in evidence.",
    };
    manifest.evidence.humanSignoff.manifestSha256 = computeManifestSha256(manifest);

    expect(validateProvisioningManifest(manifest)).toEqual([]);
    manifest.environments[0]!.services.blob.resourceId = "tampered-after-signoff";
    expect(validateProvisioningManifest(manifest)).toEqual(
      expect.arrayContaining([expect.stringMatching(/manifestSha256.*does not match/i)]),
    );
  });
});

describe("environment secret-name contract", () => {
  it("accepts the exact server-only secret names required by an environment", () => {
    const manifest = completeManifest();
    const names = manifest.credentials
      .filter((credential) => credential.environment === "production")
      .map((credential) => credential.environmentVariable);

    expect(validateEnvironmentSecretNames(manifest, "production", names)).toEqual([]);
  });

  it("rejects missing, unexpected, and browser-exposed secret names without reading values", () => {
    const manifest = completeManifest();
    const names = manifest.credentials
      .filter((credential) => credential.environment === "preview")
      .map((credential) => credential.environmentVariable)
      .filter((name) => name !== "GITHUB_APP_CLIENT_SECRET");
    names.push("NEXT_PUBLIC_RESEND_API_KEY", "UNDECLARED_PRIVILEGED_TOKEN");

    expect(validateEnvironmentSecretNames(manifest, "preview", names)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/GITHUB_APP_CLIENT_SECRET.*missing/i),
        expect.stringMatching(/NEXT_PUBLIC_RESEND_API_KEY.*public/i),
        expect.stringMatching(/UNDECLARED_PRIVILEGED_TOKEN.*not declared/i),
      ]),
    );
  });
});

describe("connection probes", () => {
  it("executes probe plans through a provider adapter without accepting credential values", async () => {
    const plans = completeProbes(completeManifest()).slice(0, 2).map((probe) => ({
      id: probe.id,
      environment: probe.environment,
      credentialId: probe.credentialId,
      targetResourceId: probe.targetResourceId,
      expected: probe.expected,
      redactedLogRef: probe.redactedLogRef,
    }));
    const attempted: string[] = [];

    const results = await executeConnectionProbes(plans, {
      attempt: async (plan) => {
        attempted.push(plan.id);
        return plan.expected;
      },
    });

    expect(results.map((probe) => probe.observed)).toEqual(["allowed", "denied"]);
    expect(attempted).toEqual(plans.map((probe) => probe.id));
    expect(JSON.stringify(plans)).not.toMatch(/token|password|secretValue/i);
  });

  it("requires successful intended access and denied cross-environment access for each identity", () => {
    const manifest = completeManifest();
    expect(runConnectionProbes(manifest, completeProbes(manifest))).toEqual([]);
  });

  it("fails when a denied probe succeeds or an identity lacks a negative probe", () => {
    const manifest = completeManifest();
    const probes = completeProbes(manifest).filter(
      (probe) => probe.credentialId !== "database-migration-preview" || probe.expected !== "denied",
    );
    probes.find((probe) => probe.expected === "denied")!.observed = "allowed";

    expect(runConnectionProbes(manifest, probes)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/unexpectedly allowed/i),
        expect.stringMatching(/database-migration-preview.*denied probe/i),
      ]),
    );
  });

  it("does not accept an expected denial against another environment using the same resource ID", () => {
    const manifest = completeManifest();
    manifest.environments[1]!.services.database.resourceId =
      manifest.environments[0]!.services.database.resourceId;

    expect(runConnectionProbes(manifest, completeProbes(manifest))).toEqual(
      expect.arrayContaining([expect.stringMatching(/resource.*shared|distinct.*resource/i)]),
    );
  });

  it("rejects probe evidence that is not bound to the intended and cross-environment resources", () => {
    const manifest = completeManifest();
    const probes = completeProbes(manifest);
    const allowed = probes.find((probe) => probe.credentialId === "blob-runtime-production" && probe.expected === "allowed")!;
    const denied = probes.find((probe) => probe.credentialId === "model-generation-production" && probe.expected === "denied")!;
    allowed.targetResourceId = "unrelated-resource";
    denied.environment = "production";

    expect(runConnectionProbes(manifest, probes)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/blob-runtime-production.*intended resource/i),
        expect.stringMatching(/model-generation-production.*cross-environment/i),
      ]),
    );
  });

  it("fails closed on malformed probe evidence", () => {
    expect(runConnectionProbes(completeManifest(), [{} as ConnectionProbe])).toEqual(
      expect.arrayContaining([expect.stringMatching(/probe.*schema/i)]),
    );
  });
});

describe("secret and privileged-endpoint scans", () => {
  it("reports credential values and private provider endpoints without returning the value", () => {
    const secret = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
    const privateEndpoint = ["postgresql:/", "/portfolio:password@private.neon.tech/portfolio"].join("");
    const findings = scanTextArtifacts([
      { path: "fixture.js", content: `const token = '${secret}'; const db = '${privateEndpoint}'` },
    ]);

    expect(findings).toHaveLength(2);
    expect(JSON.stringify(findings)).not.toContain(secret);
    expect(JSON.stringify(findings)).not.toContain(privateEndpoint);
    expect(findings.every((finding) => finding.fingerprint.length === 12)).toBe(true);
  });

  it("scans common service credentials without relying on one provider-specific prefix", () => {
    const credentials = [
      ["sk", "abcdefghijklmnopqrstuvwxyz1234567890"].join("-"),
      ["vcp", "abcdefghijklmnopqrstuvwxyz1234567890"].join("_"),
      ["vercel_blob_rw", "abcdefghijklmnopqrstuvwxyz1234567890"].join("_"),
    ];

    expect(scanTextArtifacts([{ path: "bundle.js", content: credentials.join("\n") }])).toHaveLength(3);
  });

  it("detects privileged provider endpoints beyond PostgreSQL connection strings", () => {
    const endpoints = [
      ["https://private-store.public.blob.", "vercel-storage.com/raw.pdf"].join(""),
      ["https://api.", "vercel.com/v13/deployments/internal-id"].join(""),
      ["https://api.", "resend.com/domains/private-id"].join(""),
      ["https://api.", "openai.com/v1/responses"].join(""),
      ["https://ep-private.us-west-2.aws.", "neon.tech"].join(""),
    ];

    const findings = scanTextArtifacts([{ path: "bundle.js", content: endpoints.join("\n") }]);
    expect(findings.filter((finding) => finding.category === "privileged-endpoint")).toHaveLength(5);
    expect(JSON.stringify(findings)).not.toContain("private-id");
  });

  it("allows loopback examples, redacted references, and ordinary public URLs", () => {
    expect(
      scanTextArtifacts([
        {
          path: ".env.example",
          content:
            "DATABASE_URL=postgresql://local:local-only@127.0.0.1:5432/local\nTEST_DATABASE_URL=postgresql://preview:example@db.example.com/preview\nPRIVATE_BLOB_TOKEN=vercel_blob_rw_test_local_only\nRESEND_API_KEY=re_example_at_least_24_characters\nPUBLIC_ORIGIN=https://portfolio.example\nsecret-store://vercel/preview/name",
        },
      ]),
    ).toEqual([]);
  });
});

describe("provisioning verification", () => {
  it("distinguishes verified repository checks from pending provider and human actions", () => {
    const manifest = completeManifest();
    const report = verifyProvisioning({
      manifest,
      probes: completeProbes(manifest),
      repositoryArtifacts: [{ path: "src/safe.ts", content: "export {}" }],
      publicBundleArtifacts: [{ path: ".next/static/safe.js", content: "export {}" }],
    });

    expect(report.localStatus).toBe("verified");
    expect(report.ticketStatus).toBe("pending-human-provider-actions");
    expect(report.pending).toEqual(
      expect.arrayContaining([expect.stringMatching(/provider evidence/i), expect.stringMatching(/sign-off/i)]),
    );
    expect(report).not.toHaveProperty("secrets");
  });

  it("fails closed unless repository and public-bundle scan surfaces are populated", () => {
    const manifest = completeManifest();
    const report = verifyProvisioning({
      manifest,
      probes: completeProbes(manifest),
      repositoryArtifacts: [],
      publicBundleArtifacts: [],
    });

    expect(report.localStatus).toBe("failed");
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/repository scan surface.*required/i),
        expect.stringMatching(/public-bundle scan surface.*required/i),
      ]),
    );
  });
});
