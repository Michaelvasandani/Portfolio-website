import "server-only";

import type { CareerSnapshot } from "./service";
import type { CareerIngestionFailureCode } from "./errors";

export type UploadIntentStatus = "awaiting-upload" | "processing" | "accepted" | "rejected";

export type CareerUploadIntent = {
  id: string;
  filename: string;
  objectKey: string;
  declaredType: string;
  size: number;
  expectedHash: string;
  status: UploadIntentStatus;
  createdAt: Date;
  expiresAt: Date;
  failureCode?: CareerIngestionFailureCode;
  snapshotId?: string;
};

export type RawDeletionRecord = {
  id: string;
  intentId: string;
  blobKey: string;
  state: "pending" | "leased" | "applied" | "stuck";
  attempts: number;
  nextAttemptAt: Date;
  deadlineAt: Date;
  leaseExpiresAt: Date | null;
  providerReference: string | null;
  failureCode: CareerIngestionFailureCode | "provider-state-unconfirmed" | "deletion-window-exceeded" | null;
};

export type PinnedPublicationRun = {
  id: string;
  careerSnapshotId: string;
};

export type OperationalNotification = {
  idempotencyKey: string;
  kind: "stuck-raw-deletion";
  aggregateId: string;
  state: "pending";
};

export type CareerIngestionOperationalStatus = {
  pending: number;
  leased: number;
  applied: number;
  stuck: number;
  pendingNotifications: number;
};

export interface CareerIngestionStore {
  createIntent(intent: CareerUploadIntent): Promise<void>;
  readIntent(id: string): Promise<CareerUploadIntent | null>;
  markProcessing(id: string): Promise<void>;
  rejectAndEnqueueDeletion(input: {
    intentId: string;
    blobKey: string;
    failureCode: CareerIngestionFailureCode;
    now: Date;
    deletionDeadline: Date;
  }): Promise<void>;
  installAndEnqueueDeletion(input: {
    intentId: string;
    blobKey: string;
    snapshot: CareerSnapshot;
    now: Date;
    deletionDeadline: Date;
  }): Promise<{ snapshotId: string; duplicate: boolean }>;
  leaseNextDeletion(now: Date, leaseExpiresAt: Date): Promise<RawDeletionRecord | null>;
  markDeletionApplied(id: string, providerReference: string): Promise<RawDeletionRecord>;
  retryDeletion(id: string, nextAttemptAt: Date, failureCode: "provider-state-unconfirmed"): Promise<RawDeletionRecord>;
  markDeletionStuck(id: string, failureCode: "deletion-window-exceeded"): Promise<RawDeletionRecord>;
  enqueueNotification(notification: OperationalNotification): Promise<void>;
  expireUploadIntents(now: Date, deletionDeadline: Date): Promise<number>;
  ingestionStatus(): Promise<CareerIngestionOperationalStatus>;
}

type InMemoryCareerIngestionStoreInput = {
  currentSnapshot?: CareerSnapshot;
};

export class InMemoryCareerIngestionStore implements CareerIngestionStore {
  readonly #intents = new Map<string, CareerUploadIntent>();
  readonly #snapshots = new Map<string, CareerSnapshot>();
  readonly #snapshotByDocumentHash = new Map<string, string>();
  readonly #deletions = new Map<string, RawDeletionRecord>();
  readonly #publicationRuns = new Map<string, PinnedPublicationRun>();
  readonly #notifications = new Map<string, OperationalNotification>();
  #currentSnapshotId: string | null = null;

  constructor(input: InMemoryCareerIngestionStoreInput = {}) {
    if (input.currentSnapshot) {
      const snapshot = structuredClone(input.currentSnapshot);
      this.#snapshots.set(snapshot.id, snapshot);
      this.#snapshotByDocumentHash.set(snapshot.sourceDocumentHash, snapshot.id);
      this.#currentSnapshotId = snapshot.id;
    }
  }

  async createIntent(intent: CareerUploadIntent): Promise<void> {
    if (this.#intents.has(intent.id)) throw new Error("Upload intent already exists.");
    this.#intents.set(intent.id, structuredClone(intent));
  }

  async readIntent(id: string): Promise<CareerUploadIntent | null> {
    const intent = this.#intents.get(id);
    return intent ? structuredClone(intent) : null;
  }

  async markProcessing(id: string): Promise<void> {
    const intent = this.#intents.get(id);
    if (!intent || intent.status !== "awaiting-upload") throw new Error("Upload intent cannot be processed.");
    intent.status = "processing";
  }

  #enqueueDeletion(input: {
    intentId: string;
    blobKey: string;
    now: Date;
    deletionDeadline: Date;
  }): void {
    const id = `deletion:${input.intentId.slice("upload:".length)}`;
    if (this.#deletions.has(id)) return;
    this.#deletions.set(id, {
      id,
      intentId: input.intentId,
      blobKey: input.blobKey,
      state: "pending",
      attempts: 0,
      nextAttemptAt: input.now,
      deadlineAt: input.deletionDeadline,
      leaseExpiresAt: null,
      providerReference: null,
      failureCode: null,
    });
  }

  async rejectAndEnqueueDeletion(input: {
    intentId: string;
    blobKey: string;
    failureCode: CareerIngestionFailureCode;
    now: Date;
    deletionDeadline: Date;
  }): Promise<void> {
    const intent = this.#intents.get(input.intentId);
    if (!intent) throw new Error("Upload intent does not exist.");
    intent.status = "rejected";
    intent.failureCode = input.failureCode;
    this.#enqueueDeletion(input);
  }

  async installAndEnqueueDeletion(input: {
    intentId: string;
    blobKey: string;
    snapshot: CareerSnapshot;
    now: Date;
    deletionDeadline: Date;
  }): Promise<{ snapshotId: string; duplicate: boolean }> {
    const intent = this.#intents.get(input.intentId);
    if (!intent) throw new Error("Upload intent does not exist.");
    const existingId = this.#snapshotByDocumentHash.get(input.snapshot.sourceDocumentHash);
    const snapshotId = existingId ?? input.snapshot.id;
    if (!existingId) {
      this.#snapshots.set(snapshotId, structuredClone(input.snapshot));
      this.#snapshotByDocumentHash.set(input.snapshot.sourceDocumentHash, snapshotId);
      this.#currentSnapshotId = snapshotId;
    }
    intent.status = "accepted";
    intent.snapshotId = snapshotId;
    this.#enqueueDeletion(input);
    return { snapshotId, duplicate: Boolean(existingId) };
  }

  async leaseNextDeletion(now: Date, leaseExpiresAt: Date): Promise<RawDeletionRecord | null> {
    const record = [...this.#deletions.values()].find(
      (candidate) =>
        (candidate.state === "pending" && candidate.nextAttemptAt.getTime() <= now.getTime()) ||
        (candidate.state === "leased" &&
          candidate.leaseExpiresAt !== null &&
          candidate.leaseExpiresAt.getTime() <= now.getTime()),
    );
    if (!record) return null;
    record.state = "leased";
    record.leaseExpiresAt = leaseExpiresAt;
    record.attempts += 1;
    return structuredClone(record);
  }

  async markDeletionApplied(id: string, providerReference: string): Promise<RawDeletionRecord> {
    const record = this.#deletions.get(id);
    if (!record) throw new Error("Deletion record does not exist.");
    record.state = "applied";
    record.leaseExpiresAt = null;
    record.providerReference = providerReference;
    record.failureCode = null;
    return structuredClone(record);
  }

  async retryDeletion(id: string, nextAttemptAt: Date, failureCode: "provider-state-unconfirmed"): Promise<RawDeletionRecord> {
    const record = this.#deletions.get(id);
    if (!record) throw new Error("Deletion record does not exist.");
    record.state = "pending";
    record.leaseExpiresAt = null;
    record.nextAttemptAt = nextAttemptAt;
    record.failureCode = failureCode;
    return structuredClone(record);
  }

  async markDeletionStuck(id: string, failureCode: "deletion-window-exceeded"): Promise<RawDeletionRecord> {
    const record = this.#deletions.get(id);
    if (!record) throw new Error("Deletion record does not exist.");
    record.state = "stuck";
    record.leaseExpiresAt = null;
    record.failureCode = failureCode;
    return structuredClone(record);
  }

  async enqueueNotification(notification: OperationalNotification): Promise<void> {
    if (!this.#notifications.has(notification.idempotencyKey)) {
      this.#notifications.set(notification.idempotencyKey, structuredClone(notification));
    }
  }

  async expireUploadIntents(now: Date, deletionDeadline: Date): Promise<number> {
    let expired = 0;
    for (const intent of this.#intents.values()) {
      if (intent.status !== "awaiting-upload" || intent.expiresAt.getTime() > now.getTime()) continue;
      intent.status = "rejected";
      intent.failureCode = "upload-intent-expired";
      this.#enqueueDeletion({
        intentId: intent.id,
        blobKey: intent.objectKey,
        now,
        deletionDeadline,
      });
      expired += 1;
    }
    return expired;
  }

  async ingestionStatus(): Promise<CareerIngestionOperationalStatus> {
    const records = [...this.#deletions.values()];
    return {
      pending: records.filter(({ state }) => state === "pending").length,
      leased: records.filter(({ state }) => state === "leased").length,
      applied: records.filter(({ state }) => state === "applied").length,
      stuck: records.filter(({ state }) => state === "stuck").length,
      pendingNotifications: [...this.#notifications.values()].filter(({ state }) => state === "pending").length,
    };
  }

  intent(id: string): CareerUploadIntent | null {
    const intent = this.#intents.get(id);
    return intent ? structuredClone(intent) : null;
  }

  currentSnapshot(): CareerSnapshot | null {
    if (!this.#currentSnapshotId) return null;
    return structuredClone(this.#snapshots.get(this.#currentSnapshotId)!);
  }

  deletionRecords(): RawDeletionRecord[] {
    return structuredClone([...this.#deletions.values()]);
  }

  startPublicationRun(run: PinnedPublicationRun): void {
    this.#publicationRuns.set(run.id, structuredClone(run));
  }

  publicationRun(id: string): PinnedPublicationRun | null {
    const run = this.#publicationRuns.get(id);
    return run ? structuredClone(run) : null;
  }

  notifications(): OperationalNotification[] {
    return structuredClone([...this.#notifications.values()]);
  }

  serializedState(): string {
    return JSON.stringify({
      intents: [...this.#intents.values()],
      snapshots: [...this.#snapshots.values()],
      deletions: [...this.#deletions.values()],
      publicationRuns: [...this.#publicationRuns.values()],
      notifications: [...this.#notifications.values()],
      currentSnapshotId: this.#currentSnapshotId,
    });
  }
}
