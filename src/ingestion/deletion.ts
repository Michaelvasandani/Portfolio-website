import "server-only";

import type { BlobUploadProvider } from "./service";
import type { CareerIngestionStore, RawDeletionRecord } from "./store";

const LEASE_MILLISECONDS = 30_000;
const MAXIMUM_BACKOFF_MILLISECONDS = 60_000;
const DELETION_WINDOW_MILLISECONDS = 15 * 60 * 1_000;

type RawDeletionWorkerDependencies = {
  store: CareerIngestionStore;
  blob: BlobUploadProvider;
  now?: () => Date;
};

export class UploadIntentSweeper {
  readonly #store: CareerIngestionStore;
  readonly #now: () => Date;

  constructor(dependencies: { store: CareerIngestionStore; now?: () => Date }) {
    this.#store = dependencies.store;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async run(): Promise<number> {
    const now = this.#now();
    return this.#store.expireUploadIntents(
      now,
      new Date(now.getTime() + DELETION_WINDOW_MILLISECONDS),
    );
  }
}

export class RawDeletionWorker {
  readonly #store: CareerIngestionStore;
  readonly #blob: BlobUploadProvider;
  readonly #now: () => Date;

  constructor(dependencies: RawDeletionWorkerDependencies) {
    this.#store = dependencies.store;
    this.#blob = dependencies.blob;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async #retryOrEscalate(record: RawDeletionRecord): Promise<RawDeletionRecord> {
    const now = this.#now();
    if (now.getTime() >= record.deadlineAt.getTime()) {
      const stuck = await this.#store.markDeletionStuck(record.id, "deletion-window-exceeded");
      await this.#store.enqueueNotification({
        idempotencyKey: `raw-deletion-stuck:${record.id}`,
        kind: "stuck-raw-deletion",
        aggregateId: record.id,
        state: "pending",
      });
      return stuck;
    }
    const backoff = Math.min(2 ** record.attempts * 1_000, MAXIMUM_BACKOFF_MILLISECONDS);
    return this.#store.retryDeletion(
      record.id,
      new Date(now.getTime() + backoff),
      "provider-state-unconfirmed",
    );
  }

  async runOne(): Promise<RawDeletionRecord | null> {
    const now = this.#now();
    const record = await this.#store.leaseNextDeletion(
      now,
      new Date(now.getTime() + LEASE_MILLISECONDS),
    );
    if (!record) return null;
    const idempotencyKey = `raw-deletion:${record.id}`;
    try {
      const before = await this.#blob.deletionState(record.blobKey, idempotencyKey);
      if (before === "absent") {
        return this.#store.markDeletionApplied(record.id, "already-absent");
      }
      if (before !== "present") return this.#retryOrEscalate(record);
      const result = await this.#blob.deleteRawBlob(record.blobKey, idempotencyKey);
      const after = await this.#blob.deletionState(record.blobKey, idempotencyKey);
      if (after === "absent") {
        return this.#store.markDeletionApplied(
          record.id,
          result?.providerReference ?? "provider-confirmed-absent",
        );
      }
      return this.#retryOrEscalate(record);
    } catch {
      return this.#retryOrEscalate(record);
    }
  }
}
