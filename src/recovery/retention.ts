import { canonicalJson, sha256 } from "../github/canonical";
import { AmbiguousProviderResultError } from "../publication/contracts";
import { clone, reconcileProviderEffect } from "./provider-effect";

export type RetentionRecordKind = "valid-deployment" | "career-snapshot" | "manifest" | "check-outcome" | "reproducibility" | "compact-audit" | "bulky-diagnostic";
export type RetentionRecord = Readonly<{
  id: string;
  kind: RetentionRecordKind;
  createdAt: string;
  dependencies: readonly string[];
  lifecycle?: "valid" | "rejected" | "quarantined";
}>;

export type RetentionPlan = Readonly<{
  idempotencyKey: string;
  generatedAt: string;
  preserved: readonly RetentionRecord[];
  deleted: readonly RetentionRecord[];
  blockedDependencyIds: readonly string[];
  summary: Readonly<Record<RetentionRecordKind, Readonly<{ preserved: number; deleted: number }>>>;
}>;

const year = 365 * 86_400_000;
const thirtyDays = 30 * 86_400_000;

export function planRetention(records: readonly RetentionRecord[], now: Date): RetentionPlan {
  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length) throw new Error("retention-record-id-conflict");
  for (const record of records) {
    if (Number.isNaN(new Date(record.createdAt).getTime())) throw new Error(`retention-created-at-invalid:${record.id}`);
    for (const dependency of record.dependencies) if (!byId.has(dependency)) throw new Error(`retention-dependency-missing:${record.id}:${dependency}`);
  }
  const latestValid = records.filter(({ kind }) => kind === "valid-deployment")
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.id.localeCompare(left.id))
    .slice(0, 20);
  const preserveIds = new Set<string>();
  const preserveWithDependencies = (id: string) => {
    if (preserveIds.has(id)) return;
    const record = byId.get(id);
    if (!record) throw new Error(`retention-dependency-missing:${id}`);
    preserveIds.add(id);
    for (const dependency of record.dependencies) preserveWithDependencies(dependency);
  };
  for (const deployment of latestValid) preserveWithDependencies(deployment.id);
  for (const record of records) {
    const age = now.getTime() - new Date(record.createdAt).getTime();
    if (record.kind === "compact-audit" && age <= year) preserveWithDependencies(record.id);
    if (record.kind === "bulky-diagnostic" && age <= thirtyDays && (record.lifecycle === "rejected" || record.lifecycle === "quarantined")) preserveWithDependencies(record.id);
  }
  const preserved = records.filter(({ id }) => preserveIds.has(id));
  const deleted = records.filter(({ id }) => !preserveIds.has(id));
  const deletedIds = new Set(deleted.map(({ id }) => id));
  const blockedDependencyIds = [...new Set(preserved.flatMap(({ dependencies }) => dependencies).filter((id) => deletedIds.has(id)))].sort();
  if (blockedDependencyIds.length) throw new Error("retention-plan-dependency-unsafe");
  const kinds: RetentionRecordKind[] = ["valid-deployment", "career-snapshot", "manifest", "check-outcome", "reproducibility", "compact-audit", "bulky-diagnostic"];
  const summary = Object.fromEntries(kinds.map((kind) => [kind, {
    preserved: preserved.filter((record) => record.kind === kind).length,
    deleted: deleted.filter((record) => record.kind === kind).length,
  }])) as RetentionPlan["summary"];
  const selectionIdentity = { preserved: preserved.map(({ id }) => id).sort(), deleted: deleted.map(({ id }) => id).sort() };
  return {
    idempotencyKey: `retention:${sha256(canonicalJson(selectionIdentity)).slice(7, 47)}`,
    generatedAt: now.toISOString(),
    preserved: structuredClone(preserved),
    deleted: structuredClone(deleted),
    blockedDependencyIds,
    summary,
  };
}

export type RetentionApplicationReport = Readonly<{
  planIdempotencyKey: string;
  outcome: "applied";
  deletedCount: number;
  preservedCount: number;
  providerReference: string;
}>;

export type RetentionIntent = Readonly<{
  id: string;
  idempotencyKey: string;
  recordIds: readonly string[];
  state: "pending" | "applied";
  providerReference: string | null;
  report: RetentionApplicationReport | null;
}>;

export interface RetentionLedger {
  record(plan: RetentionPlan): Promise<RetentionIntent>;
  applied(id: string, providerReference: string, report: RetentionApplicationReport): Promise<RetentionIntent>;
  snapshot(): Promise<readonly RetentionIntent[]>;
}

export interface RetentionCleaner {
  read(idempotencyKey: string): Promise<{ providerReference: string } | null>;
  apply(input: { idempotencyKey: string; recordIds: readonly string[] }): Promise<{ providerReference: string }>;
}

export class InMemoryRetentionLedger implements RetentionLedger {
  readonly #intents = new Map<string, RetentionIntent>();
  async record(plan: RetentionPlan): Promise<RetentionIntent> {
    const id = `outbox:${plan.idempotencyKey}`;
    const existing = this.#intents.get(id);
    if (existing) return clone(existing);
    const intent: RetentionIntent = { id, idempotencyKey: plan.idempotencyKey, recordIds: plan.deleted.map(({ id: recordId }) => recordId), state: "pending", providerReference: null, report: null };
    this.#intents.set(id, intent);
    return clone(intent);
  }
  async applied(id: string, providerReference: string, report: RetentionApplicationReport): Promise<RetentionIntent> {
    const intent = this.#intents.get(id);
    if (!intent) throw new Error("retention-intent-missing");
    if (intent.state === "applied") {
      if (intent.providerReference !== providerReference) throw new Error("retention-provider-reference-conflict");
      return clone(intent);
    }
    const applied: RetentionIntent = { ...intent, state: "applied", providerReference, report: clone(report) };
    this.#intents.set(id, applied);
    return clone(applied);
  }
  async snapshot() { return clone([...this.#intents.values()]); }
}

export class RetentionManager {
  constructor(private readonly dependencies: { ledger: RetentionLedger; cleaner: RetentionCleaner }) {}
  async apply(plan: RetentionPlan, now: Date): Promise<RetentionApplicationReport> {
    void now;
    if (plan.blockedDependencyIds.length) throw new Error("retention-plan-dependency-unsafe");
    const intent = await this.dependencies.ledger.record(plan);
    if (intent.state === "applied" && intent.report) return intent.report;
    const provider = await reconcileProviderEffect({
      read: () => this.dependencies.cleaner.read(intent.idempotencyKey),
      apply: () => this.dependencies.cleaner.apply({ idempotencyKey: intent.idempotencyKey, recordIds: intent.recordIds }),
    });
    const report: RetentionApplicationReport = {
      planIdempotencyKey: plan.idempotencyKey,
      outcome: "applied",
      deletedCount: intent.recordIds.length,
      preservedCount: plan.preserved.length,
      providerReference: provider.providerReference,
    };
    await this.dependencies.ledger.applied(intent.id, provider.providerReference, report);
    return report;
  }
}

export class InMemoryRetentionCleaner implements RetentionCleaner {
  readonly #results = new Map<string, { providerReference: string }>();
  #ambiguousResponses: number;
  readonly applications: { idempotencyKey: string; recordIds: readonly string[] }[] = [];
  constructor(input: { ambiguousResponses?: number } = {}) { this.#ambiguousResponses = input.ambiguousResponses ?? 0; }
  async read(idempotencyKey: string) { return clone(this.#results.get(idempotencyKey) ?? null); }
  async apply(input: { idempotencyKey: string; recordIds: readonly string[] }) {
    const existing = this.#results.get(input.idempotencyKey);
    if (existing) return clone(existing);
    const result = { providerReference: `cleanup:${sha256(canonicalJson(input)).slice(7, 31)}` };
    this.#results.set(input.idempotencyKey, result);
    this.applications.push(clone(input));
    if (this.#ambiguousResponses > 0) {
      this.#ambiguousResponses -= 1;
      throw new AmbiguousProviderResultError("cleanup-applied-response-lost");
    }
    return clone(result);
  }
}
