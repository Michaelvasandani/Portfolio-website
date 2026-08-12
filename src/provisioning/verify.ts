import { createHash } from "node:crypto";

import { z } from "zod";

import {
  managedEnvironments,
  requiredSignoffStatement,
  rolePolicy,
  type CredentialRole,
  type ManagedEnvironment,
} from "./policy";
import { scanTextArtifacts, type ScanFinding, type TextArtifact } from "./scans";

export { managedEnvironments } from "./policy";
export { scanTextArtifacts } from "./scans";
export type { CredentialRole, ManagedEnvironment } from "./policy";
export type { ScanFinding, TextArtifact } from "./scans";

export interface CredentialGrant {
  id: string;
  role: CredentialRole;
  environment: ManagedEnvironment;
  holder: "vercel-server" | "github-actions";
  environmentVariable: string;
  allowedOperations: string[];
  secretStore: string;
  rotationOwner: string;
  revocationPath: string;
}

export type NoConfigurableGitHubTokenPermissions = Readonly<Record<string, never>>;

export interface EnvironmentProvisioning {
  environment: ManagedEnvironment;
  publicOrigin: string;
  oauthCallback: string;
  services: {
    vercel: {
      plan: "pro";
      projectId: string;
      controlCredentialId: string;
    };
    database: {
      provider: "neon-marketplace";
      marketplace: "vercel-marketplace" | string;
      resourceId: string;
      pooledRuntime: boolean;
      runtimeCredentialId: string;
      migrationCredentialId: string;
      pointInTimeRecovery: { enabled: boolean; evidenceRef: string };
    };
    blob: {
      resourceId: string;
      access: "private" | "public";
      runtimeCredentialId: string;
    };
    sandbox: {
      resourceId: string;
      networkDefault: "deny" | "allow";
      parserImageDigest: string;
      limits: {
        cpuCores: number;
        memoryMiB: number;
        timeoutSeconds: number;
        maximumFiles: number;
        maximumExtractedBytes: number;
      };
    };
    githubApp: {
      appId: string;
      oauthCredentialId: string;
      immutableOwnerIdSecretRef: string;
      permissions: Record<string, string>;
    };
    githubActions: {
      ingestionCredentialId: string;
      permissions: NoConfigurableGitHubTokenPermissions;
      forbiddenCredentialRolesPresent: string[];
    };
    model: {
      provider: string;
      model: string;
      version: string;
      credentialId: string;
      structuredOutput: boolean;
      providerTraining: boolean;
      retention: "zero" | "provider-default";
    };
    resend: {
      domain: string;
      domainVerified: boolean;
      credentialId: string;
    };
  };
}

export interface ProvisioningManifest {
  schemaVersion: 1;
  reviewedBy: "pending-human-review" | string;
  environments: EnvironmentProvisioning[];
  credentials: CredentialGrant[];
  evidence: {
    providerSettings: Array<{
      environment: ManagedEnvironment;
      provider: string;
      redactedRef: string;
    }>;
    humanSignoff: {
      status: "pending" | "signed";
      owner: "Michael Sagar Vasandani";
      reviewer?: string;
      signedAt?: string;
      evidenceRef?: string;
      manifestSha256?: string;
      statement?: string;
    };
  };
}

export interface ConnectionProbe {
  id: string;
  environment: ManagedEnvironment;
  credentialId: string;
  targetResourceId: string;
  expected: "allowed" | "denied";
  observed: "allowed" | "denied" | "unavailable";
  redactedLogRef: string;
}

export type ConnectionProbePlan = Omit<ConnectionProbe, "observed">;

export interface ConnectionProbeAdapter {
  attempt(plan: ConnectionProbePlan): Promise<ConnectionProbe["observed"]>;
}

export interface ProvisioningVerificationInput {
  manifest: ProvisioningManifest;
  probes: ConnectionProbe[];
  repositoryArtifacts: TextArtifact[];
  publicBundleArtifacts: TextArtifact[];
}

export interface ProvisioningVerificationReport {
  localStatus: "verified" | "failed";
  ticketStatus: "accepted" | "pending-human-provider-actions" | "failed";
  errors: string[];
  pending: string[];
  scans: { repositoryFindings: ScanFinding[]; publicBundleFindings: ScanFinding[] };
}

const manifestEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  reviewedBy: z.string(),
  environments: z.array(z.unknown()),
  credentials: z.array(z.unknown()),
  evidence: z.object({
    providerSettings: z.array(z.unknown()),
    humanSignoff: z.object({ status: z.enum(["pending", "signed"]) }).passthrough(),
  }),
}).passthrough();

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function hasExactOperations(grant: CredentialGrant): boolean {
  const actual = [...grant.allowedOperations].sort();
  const expected = [...rolePolicy[grant.role].allowedOperations].sort();
  return actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
}

function validateCredentialReference(
  manifest: ProvisioningManifest,
  environment: ManagedEnvironment,
  role: CredentialRole,
  id: string,
): string[] {
  const matches = manifest.credentials.filter((credential) => credential.id === id);
  if (matches.length !== 1) return [`${environment} ${role} credential reference must resolve exactly once`];
  const match = matches[0]!;
  if (match.environment !== environment || match.role !== role) {
    return [`${environment} ${role} credential reference crosses an environment or role boundary`];
  }
  return [];
}

function validateProvisioningManifestShape(manifest: ProvisioningManifest): string[] {
  const errors: string[] = [];
  if (!new Set(["pending-human-review", "Michael Sagar Vasandani"]).has(manifest.reviewedBy)) {
    errors.push("reviewedBy must be pending-human-review or Michael Sagar Vasandani");
  }
  if (manifest.evidence.humanSignoff.owner !== "Michael Sagar Vasandani") {
    errors.push("sign-off owner must be Michael Sagar Vasandani");
  }
  const presentEnvironments = new Set(manifest.environments.map((entry) => entry.environment));
  for (const environment of managedEnvironments) {
    if (!presentEnvironments.has(environment)) errors.push(`missing ${environment} environment`);
  }

  if (duplicates(manifest.credentials.map((credential) => credential.id)).length > 0) {
    errors.push("credential IDs must be unique across environments");
  }

  const resourceFields: Array<[string, (entry: EnvironmentProvisioning) => string]> = [
    ["Vercel project", (entry) => entry.services.vercel.projectId],
    ["database resource", (entry) => entry.services.database.resourceId],
    ["Blob store", (entry) => entry.services.blob.resourceId],
    ["Sandbox resource", (entry) => entry.services.sandbox.resourceId],
    ["GitHub App", (entry) => entry.services.githubApp.appId],
    ["Resend domain", (entry) => entry.services.resend.domain],
  ];
  for (const [label, select] of resourceFields) {
    if (duplicates(manifest.environments.map(select)).length > 0) {
      errors.push(`${label} must not be shared across environments`);
    }
  }

  for (const entry of manifest.environments) {
    const { services } = entry;
    let origin: URL | undefined;
    let callback: URL | undefined;
    try {
      origin = new URL(entry.publicOrigin);
      callback = new URL(entry.oauthCallback);
    } catch {
      errors.push(`${entry.environment} origin and callback must be valid URLs`);
    }
    if (
      !origin || origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash || entry.publicOrigin !== origin.origin
    ) {
      errors.push(`${entry.environment} public origin must be an exact HTTPS origin`);
    }
    if (
      !origin || !callback || callback.protocol !== "https:" || callback.username || callback.password ||
      callback.origin !== origin.origin || callback.pathname !== "/api/auth/github/callback" ||
      callback.search || callback.hash || entry.oauthCallback.includes("*")
    ) {
      errors.push(`${entry.environment} OAuth callback must be exact and match its allowed origin`);
    }
    if (services.vercel.plan !== "pro") errors.push(`${entry.environment} Vercel plan must be Pro`);
    if (services.database.provider !== "neon-marketplace" || services.database.marketplace !== "vercel-marketplace") {
      errors.push(`${entry.environment} database must be Neon through Vercel Marketplace`);
    }
    if (!services.database.pooledRuntime) errors.push(`${entry.environment} database runtime must be pooled`);
    if (!services.database.pointInTimeRecovery.enabled) {
      errors.push(`${entry.environment} database point-in-time recovery must be enabled`);
    }
    if (services.blob.access !== "private") errors.push(`${entry.environment} Blob must be private`);
    if (services.sandbox.networkDefault !== "deny") {
      errors.push(`${entry.environment} Sandbox network default must deny access`);
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(services.sandbox.parserImageDigest)) {
      errors.push(`${entry.environment} Sandbox parser image must use a pinned digest`);
    }
    const limits = services.sandbox.limits;
    if (!limits || !Number.isInteger(limits.cpuCores) || limits.cpuCores < 1 || limits.cpuCores > 4) {
      errors.push(`${entry.environment} Sandbox CPU limit must be an integer from 1 to 4 cores`);
    }
    if (!limits || !Number.isInteger(limits.memoryMiB) || limits.memoryMiB < 128 || limits.memoryMiB > 4096) {
      errors.push(`${entry.environment} Sandbox memory limit must be 128–4096 MiB`);
    }
    if (!limits || !Number.isInteger(limits.timeoutSeconds) || limits.timeoutSeconds < 1 || limits.timeoutSeconds > 900) {
      errors.push(`${entry.environment} Sandbox timeout must be 1–900 seconds`);
    }
    if (!limits || !Number.isInteger(limits.maximumFiles) || limits.maximumFiles < 1 || limits.maximumFiles > 1000) {
      errors.push(`${entry.environment} Sandbox file-count limit must be 1–1000`);
    }
    if (!limits || !Number.isInteger(limits.maximumExtractedBytes) || limits.maximumExtractedBytes < 1 || limits.maximumExtractedBytes > 100_000_000) {
      errors.push(`${entry.environment} Sandbox extracted-size limit must be 1–100000000 bytes`);
    }
    if (
      Object.keys(services.githubApp.permissions).length !== 1 ||
      services.githubApp.permissions.metadata !== "read"
    ) {
      errors.push(`${entry.environment} GitHub App permissions must remain minimal identity metadata read`);
    }
    if (services.githubActions.forbiddenCredentialRolesPresent.length > 0) {
      errors.push(`${entry.environment} GitHub Actions contains forbidden provider credential roles`);
    }
    if (Object.keys(services.githubActions.permissions).length !== 0) {
      errors.push(`${entry.environment} GitHub Actions must grant no configurable GITHUB_TOKEN permissions`);
    }
    if (!services.model.structuredOutput) errors.push(`${entry.environment} model must support structured output`);
    if (services.model.providerTraining) errors.push(`${entry.environment} model provider training must be disabled`);
    if (services.model.retention !== "zero") errors.push(`${entry.environment} model retention must be zero`);
    if (!services.resend.domainVerified) errors.push(`${entry.environment} Resend domain must be verified`);

    const references: Array<[CredentialRole, string]> = [
      ["vercel-control", services.vercel.controlCredentialId],
      ["database-runtime", services.database.runtimeCredentialId],
      ["database-migration", services.database.migrationCredentialId],
      ["blob-runtime", services.blob.runtimeCredentialId],
      ["github-oauth", services.githubApp.oauthCredentialId],
      ["github-ingestion", services.githubActions.ingestionCredentialId],
      ["model-generation", services.model.credentialId],
      ["resend-notification", services.resend.credentialId],
    ];
    for (const [role, id] of references) {
      errors.push(...validateCredentialReference(manifest, entry.environment, role, id));
    }
  }

  for (const credential of manifest.credentials) {
    if (!hasExactOperations(credential)) {
      errors.push(`${credential.id} allowed operations exceed or omit the ${credential.role} contract`);
    }
    const policy = rolePolicy[credential.role];
    const expectedHolder = policy.holder;
    if (credential.holder !== expectedHolder) errors.push(`${credential.id} has the wrong credential holder`);
    if (credential.environmentVariable.startsWith("NEXT_PUBLIC_")) {
      errors.push(`${credential.id} must never use a NEXT_PUBLIC secret environment variable`);
    }
    if (credential.environmentVariable !== policy.environmentVariable) {
      errors.push(`${credential.id} must use ${policy.environmentVariable}`);
    }
    if (!credential.rotationOwner.trim()) errors.push(`${credential.id} must name a rotation owner`);
    if (!credential.revocationPath.startsWith("provider-console://")) {
      errors.push(`${credential.id} must name its provider revocation path`);
    }
    const expectedStorePrefix =
      credential.holder === "github-actions" ? "github-actions:" : "vercel-sensitive-env:";
    if (!credential.secretStore.startsWith(`${expectedStorePrefix}${credential.environment}`)) {
      errors.push(`${credential.id} must use its environment-scoped approved secret store`);
    }
  }

  const evidenceProviders = ["vercel", "database", "blob", "sandbox", "github-app", "model", "resend"];
  for (const environment of managedEnvironments) {
    for (const provider of evidenceProviders) {
      const matchingEvidence = manifest.evidence.providerSettings.filter(
        (entry) => entry.environment === environment && entry.provider === provider,
      );
      if (matchingEvidence.length !== 1 || !matchingEvidence[0]!.redactedRef.trim()) {
        errors.push(`${environment} ${provider} must have exactly one redacted evidence reference`);
      }
    }
  }
  if (manifest.evidence.humanSignoff.status === "signed") {
    const signoff = manifest.evidence.humanSignoff;
    if (manifest.reviewedBy !== "Michael Sagar Vasandani" || signoff.reviewer !== "Michael Sagar Vasandani") {
      errors.push("reviewer must be Michael Sagar Vasandani for signed human approval");
    }
    if (!isExactUtcIsoDate(signoff.signedAt)) {
      errors.push("signedAt must be an exact UTC ISO date for signed human approval");
    }
    if (!signoff.evidenceRef || signoff.evidenceRef.startsWith("evidence://") || !signoff.evidenceRef.includes("ticket-02")) {
      errors.push("a private non-placeholder ticket-02 evidence reference is required for signed approval");
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(signoff.manifestSha256 ?? "")) {
      errors.push("manifestSha256 is required for signed human approval");
    } else if (signoff.manifestSha256 !== computeManifestSha256(manifest)) {
      errors.push("manifestSha256 does not match the signed provisioning manifest");
    }
    if (signoff.statement !== requiredSignoffStatement) {
      errors.push("the exact provisioning sign-off statement is required");
    }
  }

  return errors;
}

export function validateProvisioningManifest(manifest: unknown): string[] {
  const parsed = manifestEnvelopeSchema.safeParse(manifest);
  if (!parsed.success) return ["provisioning manifest does not match schema version 1"];
  try {
    return validateProvisioningManifestShape(parsed.data as unknown as ProvisioningManifest);
  } catch {
    return ["provisioning manifest does not match schema version 1"];
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "manifestSha256")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function isExactUtcIsoDate(value: string | undefined): boolean {
  if (!value?.endsWith("Z")) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

export function computeManifestSha256(manifest: ProvisioningManifest): string {
  const digest = createHash("sha256").update(JSON.stringify(canonicalize(manifest))).digest("hex");
  return `sha256:${digest}`;
}

export function validateEnvironmentSecretNames(
  manifest: ProvisioningManifest,
  environment: ManagedEnvironment,
  suppliedNames: string[],
): string[] {
  const errors: string[] = [];
  const expectedNames = new Set(
    manifest.credentials
      .filter((credential) => credential.environment === environment)
      .map((credential) => credential.environmentVariable),
  );
  const supplied = new Set(suppliedNames);
  for (const name of expectedNames) {
    if (!supplied.has(name)) errors.push(`${name} is missing from the ${environment} secret-name inventory`);
  }
  for (const name of supplied) {
    if (name.startsWith("NEXT_PUBLIC_")) errors.push(`${name} exposes a secret through a public variable`);
    if (!expectedNames.has(name)) errors.push(`${name} is not declared for the ${environment} environment`);
  }
  return errors;
}

function probeTarget(
  manifest: ProvisioningManifest,
  role: CredentialRole,
  environment: ManagedEnvironment,
): string | undefined {
  const entry = manifest.environments.find((candidate) => candidate.environment === environment);
  if (!entry) return undefined;
  const { services } = entry;
  const targets: Record<CredentialRole, string> = {
    "database-runtime": services.database.resourceId,
    "database-migration": services.database.resourceId,
    "blob-runtime": services.blob.resourceId,
    "github-oauth": services.githubApp.appId,
    "github-ingestion": new URL("/api/internal/github-ingestion", entry.publicOrigin).href,
    "model-generation": `${services.model.provider}/${services.model.model}/${services.model.version}`,
    "resend-notification": services.resend.domain,
    "vercel-control": services.vercel.projectId,
  };
  return targets[role];
}

export function runConnectionProbes(
  manifest: ProvisioningManifest,
  probes: ConnectionProbe[],
): string[] {
  const errors = validateProvisioningManifest(manifest).filter((error) => /shared across environments/i.test(error));
  for (const probe of probes) {
    if (
      !probe ||
      typeof probe.id !== "string" ||
      !managedEnvironments.includes(probe.environment) ||
      typeof probe.credentialId !== "string" ||
      typeof probe.targetResourceId !== "string" ||
      !["allowed", "denied"].includes(probe.expected) ||
      !["allowed", "denied", "unavailable"].includes(probe.observed) ||
      typeof probe.redactedLogRef !== "string"
    ) {
      errors.push("probe evidence does not match the ConnectionProbe schema");
      continue;
    }
    const credential = manifest.credentials.find((entry) => entry.id === probe.credentialId);
    if (!credential) {
      errors.push(`${probe.credentialId} probe references an unknown credential`);
      continue;
    }
    if (probe.expected === "allowed") {
      if (
        probe.environment !== credential.environment ||
        probe.targetResourceId !== probeTarget(manifest, credential.role, credential.environment)
      ) {
        errors.push(`${credential.id} allowed probe is not bound to its intended resource`);
      }
    } else if (
      probe.environment === credential.environment ||
      probe.targetResourceId !== probeTarget(manifest, credential.role, probe.environment)
    ) {
      errors.push(`${credential.id} denied probe must target a cross-environment resource`);
    }
    if (probe.expected !== probe.observed) {
      errors.push(
        probe.expected === "denied"
          ? `${probe.id} unexpectedly allowed access`
          : `${probe.id} did not allow intended access`,
      );
    }
    if (!probe.redactedLogRef.trim()) errors.push(`${probe.id} must link a redacted probe log`);
  }
  for (const credential of manifest.credentials) {
    const identityProbes = probes.filter((probe) => probe.credentialId === credential.id);
    if (!identityProbes.some((probe) => probe.expected === "allowed")) {
      errors.push(`${credential.id} is missing an allowed probe`);
    }
    if (!identityProbes.some((probe) => probe.expected === "denied")) {
      errors.push(`${credential.id} is missing a denied probe`);
    }
  }
  return errors;
}

export async function executeConnectionProbes(
  plans: ConnectionProbePlan[],
  adapter: ConnectionProbeAdapter,
): Promise<ConnectionProbe[]> {
  const results: ConnectionProbe[] = [];
  for (const plan of plans) {
    results.push({ ...plan, observed: await adapter.attempt(plan) });
  }
  return results;
}

export function verifyProvisioning(input: ProvisioningVerificationInput): ProvisioningVerificationReport {
  const repositoryFindings = scanTextArtifacts(input.repositoryArtifacts);
  const publicBundleFindings = scanTextArtifacts(input.publicBundleArtifacts);
  const errors = [
    ...validateProvisioningManifest(input.manifest),
    ...runConnectionProbes(input.manifest, input.probes),
  ];
  if (input.repositoryArtifacts.length === 0) errors.push("repository scan surface is required");
  if (input.publicBundleArtifacts.length === 0) errors.push("public-bundle scan surface is required");
  if (repositoryFindings.length > 0) errors.push("repository secret scan found possible disclosures");
  if (publicBundleFindings.length > 0) errors.push("public-bundle scan found possible disclosures");

  const pending: string[] = [];
  if (input.manifest.evidence.providerSettings.some((entry) => entry.redactedRef.startsWith("evidence://"))) {
    pending.push("replace placeholder provider evidence references with redacted exports or screenshots");
  }
  if (input.manifest.evidence.humanSignoff.status !== "signed") {
    pending.push("Michael's provisioning checklist sign-off is pending");
  }
  if (errors.length > 0) {
    return {
      localStatus: "failed",
      ticketStatus: "failed",
      errors,
      pending,
      scans: { repositoryFindings, publicBundleFindings },
    };
  }
  return {
    localStatus: "verified",
    ticketStatus: pending.length > 0 ? "pending-human-provider-actions" : "accepted",
    errors,
    pending,
    scans: { repositoryFindings, publicBundleFindings },
  };
}
