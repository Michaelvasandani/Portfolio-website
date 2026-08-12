import { z } from "zod";

import { canonicalJson, sha256 } from "./canonical";
import { verifyGitHubDeliverySignature } from "./delivery";
import {
  githubSnapshotSchema,
  githubSnapshotHashesMatch,
  hasRequiredEvidenceFailure,
  type GitHubSnapshot,
} from "./snapshot-contract";

const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identitySchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const deliveryIdentitySchema = z.string().regex(/^github-delivery:[0-9]+\.[1-9][0-9]*$/);

const failureSchema = z.object({
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }),
  stage: z.enum(["collect", "normalize", "deliver"]),
  errorCode: z.string().min(1),
}).strict();

const envelopeSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(["snapshot", "failure"]),
  deliveryId: deliveryIdentitySchema,
  repository: identitySchema,
  workflowRef: z.string().min(1),
  workflowSha: z.string().regex(/^[a-f0-9]{40}$/),
  runId: z.string().regex(/^\d+$/),
  runAttempt: z.number().int().positive(),
  sentAt: z.iso.datetime({ offset: true }),
  payloadHash: hashSchema,
  payload: z.unknown(),
}).strict();

export type GitHubDelivery = z.infer<typeof envelopeSchema> & {
  payload: GitHubSnapshot | z.infer<typeof failureSchema>;
};

export type GitHubIngestionAudit = {
  deliveryId: string | null;
  at: string;
  outcome: "accepted" | "rejected" | "warning";
  reason: string;
};

export type GitHubCollectionAttempt = {
  deliveryId: string;
  runId: string;
  finishedAt: string;
  outcome: "succeeded" | "failed";
  errorCode: string | null;
};

export interface GitHubIngestionStore {
  installVerifiedDelivery(delivery: GitHubDelivery): Promise<
    | { status: "installed"; snapshotId: string }
    | { status: "duplicate"; snapshotId: string }
    | { status: "failure-recorded" }
    | { status: "replayed" }
  >;
  recordRejectedDelivery(audit: GitHubIngestionAudit): Promise<void>;
}

export class GitHubDeliveryRejection extends Error {
  constructor(readonly reason: string, readonly status: number) {
    super("GitHub delivery rejected");
  }
}

type ReceiverOptions = {
  store: GitHubIngestionStore;
  secret: string;
  expectedRepository: string;
  expectedWorkflowRef: string;
  replayWindowMs: number;
  maxPayloadBytes: number;
  now?: () => Date;
};

export class GitHubDeliveryReceiver {
  readonly #options: ReceiverOptions;

  constructor(options: ReceiverOptions) {
    this.#options = options;
  }

  async receive(request: { rawBody: string; signature: string }) {
    const byteLength = Buffer.byteLength(request.rawBody);
    if (byteLength > this.#options.maxPayloadBytes) return this.#reject(null, "payload-too-large", 413);
    if (!verifyGitHubDeliverySignature(request.rawBody, request.signature, this.#options.secret)) {
      return this.#reject(null, "invalid-signature", 401);
    }

    let unknown: unknown;
    try {
      unknown = JSON.parse(request.rawBody);
    } catch {
      return this.#reject(null, "invalid-payload", 400);
    }
    const version = typeof unknown === "object" && unknown !== null ? (unknown as Record<string, unknown>).schemaVersion : undefined;
    if (version !== 1) return this.#reject(null, "unknown-schema", 422);
    const parsed = envelopeSchema.safeParse(unknown);
    if (!parsed.success) return this.#reject(null, "invalid-payload", 422);
    const delivery = parsed.data as GitHubDelivery;
    if (delivery.repository !== this.#options.expectedRepository || delivery.workflowRef !== this.#options.expectedWorkflowRef) {
      return this.#reject(delivery.deliveryId, "unexpected-identity", 403);
    }
    const nowMs = (this.#options.now ?? (() => new Date()))().getTime();
    if (Math.abs(nowMs - new Date(delivery.sentAt).getTime()) > this.#options.replayWindowMs) {
      return this.#reject(delivery.deliveryId, "stale-delivery", 409);
    }
    if (sha256(canonicalJson(delivery.payload)) !== delivery.payloadHash) {
      return this.#reject(delivery.deliveryId, "hash-mismatch", 422);
    }
    if (delivery.kind === "snapshot") {
      const snapshot = githubSnapshotSchema.safeParse(delivery.payload);
      if (!snapshot.success) return this.#reject(delivery.deliveryId, "invalid-snapshot", 422);
      const identity = {
        owner: snapshot.data.owner,
        pinOrder: snapshot.data.pinOrder,
        repositories: snapshot.data.repositories,
        collectionStatus: snapshot.data.collectionStatus,
      };
      if (hasRequiredEvidenceFailure(identity) || snapshot.data.collectionStatus !== "complete") {
        return this.#reject(delivery.deliveryId, "incomplete-snapshot", 422);
      }
      if (!githubSnapshotHashesMatch(snapshot.data)) {
        return this.#reject(delivery.deliveryId, "snapshot-hash-mismatch", 422);
      }
    } else if (!failureSchema.safeParse(delivery.payload).success) {
      return this.#reject(delivery.deliveryId, "invalid-failure", 422);
    }

    const result = await this.#options.store.installVerifiedDelivery(delivery);
    if (result.status === "replayed") return this.#reject(delivery.deliveryId, "replayed-delivery", 409);
    return result;
  }

  async #reject(deliveryId: string | null, reason: string, status: number): Promise<never> {
    await this.#options.store.recordRejectedDelivery({
      deliveryId,
      at: (this.#options.now ?? (() => new Date()))().toISOString(),
      outcome: "rejected",
      reason,
    });
    throw new GitHubDeliveryRejection(reason, status);
  }
}

export class InMemoryGitHubIngestionStore implements GitHubIngestionStore {
  readonly auditEvents: GitHubIngestionAudit[] = [];
  readonly collectionAttempts: GitHubCollectionAttempt[] = [];
  readonly #snapshots = new Map<string, GitHubSnapshot>();
  readonly #deliveryHashes = new Map<string, string>();
  #latestSnapshot: GitHubSnapshot | undefined;

  async installVerifiedDelivery(delivery: GitHubDelivery) {
    const previousHash = this.#deliveryHashes.get(delivery.deliveryId);
    if (previousHash !== undefined) return { status: "replayed" as const };
    this.#deliveryHashes.set(delivery.deliveryId, delivery.payloadHash);
    if (delivery.kind === "failure") {
      const failure = failureSchema.parse(delivery.payload);
      this.collectionAttempts.push({
        deliveryId: delivery.deliveryId,
        runId: delivery.runId,
        finishedAt: failure.finishedAt,
        outcome: "failed",
        errorCode: failure.errorCode,
      });
      this.auditEvents.push({ deliveryId: delivery.deliveryId, at: delivery.sentAt, outcome: "warning", reason: "collection-failed" });
      return { status: "failure-recorded" as const };
    }
    const snapshot = githubSnapshotSchema.parse(delivery.payload);
    this.collectionAttempts.push({
      deliveryId: delivery.deliveryId,
      runId: delivery.runId,
      finishedAt: snapshot.collectedAt,
      outcome: "succeeded",
      errorCode: null,
    });
    const existing = this.#snapshots.get(snapshot.contentHash);
    if (existing) {
      this.auditEvents.push({ deliveryId: delivery.deliveryId, at: delivery.sentAt, outcome: "accepted", reason: "duplicate-snapshot" });
      return { status: "duplicate" as const, snapshotId: existing.id };
    }
    this.#snapshots.set(snapshot.contentHash, snapshot);
    this.#latestSnapshot = snapshot;
    this.auditEvents.push({ deliveryId: delivery.deliveryId, at: delivery.sentAt, outcome: "accepted", reason: "snapshot-installed" });
    return { status: "installed" as const, snapshotId: snapshot.id };
  }

  async recordRejectedDelivery(audit: GitHubIngestionAudit): Promise<void> {
    this.auditEvents.push(audit);
  }

  latestSnapshot(): GitHubSnapshot | undefined {
    return this.#latestSnapshot;
  }

  snapshotCount(): number {
    return this.#snapshots.size;
  }
}
