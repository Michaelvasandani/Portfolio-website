import type { RecoverySnapshot } from "../recovery/service";

export const operationalSections = [
  { slug: "upload", label: "Upload" },
  { slug: "publication-runs", label: "Publication runs" },
  { slug: "deployments", label: "Deployments" },
  { slug: "checks", label: "Checks" },
  { slug: "served-version", label: "Served version" },
  { slug: "breaker", label: "Circuit breaker" },
  { slug: "restore-retry", label: "Restore and retry" },
  { slug: "source-freshness", label: "Source freshness" },
  { slug: "raw-deletion", label: "Raw deletion" },
  { slug: "outbox", label: "Outbox" },
  { slug: "notifications", label: "Notifications" },
  { slug: "retention", label: "Retention" },
  { slug: "backup", label: "Backup and recovery" },
  { slug: "operator-timeline", label: "Operator timeline" },
] as const;

export type OperationalSectionSlug = (typeof operationalSections)[number]["slug"];
export type OperationalShellState = "available" | "empty" | "loading" | "error" | "unavailable";

export type OperationalShellView = {
  slug: OperationalSectionSlug;
  label: string;
  state: OperationalShellState;
  summary: string;
  records: Array<{ label: string; value: string }>;
};

export interface OperationalRepository {
  read(slug: OperationalSectionSlug): Promise<OperationalShellView>;
}

export type OperationalCommand = Readonly<{
  action: "retry" | "restore" | "clear-breaker";
  targetId: string | null;
  reason: string;
  actor: "owner";
}>;

export interface OperationalControls {
  execute(command: OperationalCommand): Promise<{ outcome: "accepted"; operationId?: string }>;
}

export class UnavailableOperationalControls implements OperationalControls {
  async execute(command: OperationalCommand): Promise<never> {
    void command;
    throw new Error("operational-controls-unavailable");
  }
}

export class RecordedOperationalControls implements OperationalControls {
  constructor(private readonly ports: {
    retry(runId: string): Promise<{ operationId: string }>;
    restore(deploymentId: string, reason: string, actor: string): Promise<{ operationId: string }>;
    clearBreaker(): Promise<{ operationId: string }>;
  }) {}

  async execute(command: OperationalCommand): Promise<{ outcome: "accepted"; operationId: string }> {
    if ((command.action === "retry" || command.action === "restore") && !command.targetId) {
      throw new Error("operational-command-target-required");
    }
    const result = command.action === "retry"
      ? await this.ports.retry(command.targetId!)
      : command.action === "restore"
        ? await this.ports.restore(command.targetId!, command.reason, command.actor)
        : await this.ports.clearBreaker();
    return { outcome: "accepted", operationId: result.operationId };
  }
}

function sectionFor(slug: OperationalSectionSlug) {
  return operationalSections.find((section) => section.slug === slug)!;
}

export class UnavailableOperationalRepository implements OperationalRepository {
  constructor(private readonly reason: string) {}

  async read(slug: OperationalSectionSlug): Promise<OperationalShellView> {
    const section = sectionFor(slug);
    return {
      slug,
      label: section.label,
      state: "unavailable",
      summary: this.reason,
      records: [],
    };
  }
}

type RecordedOperationalSources = {
  recovery(): Promise<RecoverySnapshot>;
  publicationRuns(): Promise<readonly { id: string; phase: string; terminal: string | null }[]>;
  sourceFreshness(): Promise<readonly { source: string; snapshotId: string; collectedAt: string; state: string }[]>;
  rawDeletion(): Promise<readonly { id: string; state: string }[]>;
  retention(): Promise<{ preserved: number; deleted: number; lastAppliedAt: string | null }>;
  backup(): Promise<{ state: string; checkedAt: string; pointInTimeRecovery: boolean }>;
};

export class RecordedOperationalRepository implements OperationalRepository {
  constructor(private readonly sources: RecordedOperationalSources) {}

  async read(slug: OperationalSectionSlug): Promise<OperationalShellView> {
    const section = sectionFor(slug);
    const recovery = await this.sources.recovery();
    const available = (summary: string, records: OperationalShellView["records"]): OperationalShellView => ({
      slug,
      label: section.label,
      state: records.length ? "available" : "empty",
      summary,
      records,
    });
    switch (slug) {
      case "upload":
        return available("Authenticated Career replacement is available through the owner upload workflow.", []);
      case "publication-runs": {
        const runs = await this.sources.publicationRuns();
        return available(`${runs.length} recorded publication run${runs.length === 1 ? "" : "s"}.`, runs.flatMap((run) => [
          { label: run.id, value: `${run.phase} · ${run.terminal ?? "active"}` },
        ]));
      }
      case "deployments":
        return available(`${recovery.deployments.length} retained deployment record${recovery.deployments.length === 1 ? "" : "s"}.`, recovery.deployments.map((deployment) => ({ label: deployment.id, value: deployment.state })));
      case "checks": {
        const entries = recovery.incidents.flatMap((incident) => [
          ...incident.evidence.map((evidence) => ({ label: evidence.check.checkerId, value: `${evidence.check.checkerVersion} · ${evidence.check.configurationHash} · ${evidence.check.target} · ${evidence.check.finishedAt} · ${evidence.check.reportPointer}` })),
          ...(incident.verification ? [{
            label: incident.verification.check.checkerId,
            value: `${incident.verification.check.checkerVersion} · rules ${incident.verification.check.rulesHash} · config ${incident.verification.check.configurationHash} · ${incident.verification.check.environment.runner}/${incident.verification.check.environment.image}/${incident.verification.check.environment.cleanEnvironmentId} · ${incident.verification.check.target} · ${incident.verification.check.finishedAt} · ${incident.verification.check.outcome} · retries ${incident.verification.check.retryHistory.length} · ${incident.verification.check.reportPointer}`,
          }] : []),
        ]);
        return available("Objective production and recovery-check evidence.", entries);
      }
      case "served-version": {
        const served = recovery.deployments.find(({ id }) => id === recovery.servedDeploymentId);
        return available("Provider-reconciled currently served immutable deployment.", served ? [
          { label: "Deployment", value: served.id },
          { label: "Provider deployment", value: served.providerDeploymentId },
          { label: "Candidate hash", value: served.candidateHash },
          { label: "Manifest hash", value: served.manifestHash },
          { label: "Public output hash", value: served.publicOutputHash },
        ] : []);
      }
      case "breaker":
        return available("Publication promotion gate; source collection remains permitted while open.", [
          { label: "State", value: recovery.breaker.state },
          { label: "Reason", value: recovery.breaker.reason ?? "none" },
          { label: "Failing deployment", value: recovery.breaker.failingDeploymentId ?? "none" },
          { label: "Opened", value: recovery.breaker.openedAt ?? "never" },
          { label: "Cleared", value: recovery.breaker.clearedAt ?? "not cleared" },
        ]);
      case "restore-retry": {
        const valid = recovery.deployments.filter(({ state }) => state === "valid");
        return available("Retained Valid deployments are eligible for an explicit exceptional restore; Quarantined content is not.", valid.map((deployment) => ({ label: deployment.id, value: `${deployment.createdAt} · ${deployment.careerSnapshotId}` })));
      }
      case "source-freshness": {
        const sources = await this.sources.sourceFreshness();
        return available("Latest immutable source collection state.", sources.map((source) => ({ label: source.source, value: `${source.state} · ${source.snapshotId} · ${source.collectedAt}` })));
      }
      case "raw-deletion": {
        const deletion = await this.sources.rawDeletion();
        return available("Transactional raw-Blob deletion intents and reconciliation state.", deletion.map((entry) => ({ label: entry.id, value: entry.state })));
      }
      case "outbox":
        return available("Pending and reconciled recovery effects.", recovery.outbox.map((entry) => ({ label: entry.idempotencyKey, value: entry.state })));
      case "notifications":
        return available("PostgreSQL-authoritative actionable notification ledger.", recovery.notifications.map((entry) => ({ label: entry.kind, value: `${entry.state}${entry.providerMessageId ? ` · ${entry.providerMessageId}` : ""}` })));
      case "retention": {
        const retention = await this.sources.retention();
        return available("Latest dry-run or applied dependency-safe retention report.", [
          { label: "Restorable Valid deployments", value: String(retention.preserved) },
          { label: "Selected for deletion", value: String(retention.deleted) },
          { label: "Last applied", value: retention.lastAppliedAt ?? "not applied" },
        ]);
      }
      case "backup": {
        const backup = await this.sources.backup();
        return available("Neon backup and point-in-time recovery monitor state.", [
          { label: "State", value: backup.state },
          { label: "Checked", value: backup.checkedAt },
          { label: "Point-in-time recovery", value: backup.pointInTimeRecovery ? "configured" : "not configured" },
        ]);
      }
      case "operator-timeline": {
        const entries = recovery.incidents.flatMap((incident) => incident.timeline.map((entry) => ({
          label: `${incident.id} #${entry.sequence}`,
          value: `${entry.at} · ${entry.event}`,
        })));
        return available("Chronological recovery events suitable for provider/database/public-state reconciliation.", entries);
      }
    }
  }
}

export function isOperationalSection(value: string): value is OperationalSectionSlug {
  return operationalSections.some(({ slug }) => slug === value);
}
