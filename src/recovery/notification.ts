import { canonicalJson, sha256 } from "../github/canonical";
import { AmbiguousProviderResultError, ProductionAdapterUnavailableError } from "../publication/contracts";
import type { NotificationKind } from "./service";
import type { RecoveryStore } from "./service";
import { clone, reconcileProviderEffect } from "./provider-effect";

export type NotificationRecord = Readonly<{
  id: string;
  kind: NotificationKind;
  subject: string;
  details: string;
  idempotencyKey: string;
  state: "pending" | "delivered" | "failed";
  providerMessageId: string | null;
  createdAt: string;
}>;

export type NotificationOutboxEntry = Readonly<{
  id: string;
  notificationId: string;
  idempotencyKey: string;
  state: "pending" | "leased" | "applied" | "failed";
  attempts: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  providerReference: string | null;
}>;

export interface NotificationLedger {
  record(input: { kind: NotificationKind; subject: string; details: string; now: Date }): Promise<NotificationRecord>;
  leaseNext(owner: string, now: Date, expiresAt: Date): Promise<{ notification: NotificationRecord; outbox: NotificationOutboxEntry } | null>;
  delivered(input: { outboxId: string; owner: string; providerMessageId: string }): Promise<NotificationRecord>;
  release(input: { outboxId: string; owner: string; terminal: boolean }): Promise<void>;
  snapshot(): Promise<{ notifications: readonly NotificationRecord[]; outbox: readonly NotificationOutboxEntry[] }>;
}

export interface ResendPort {
  read(idempotencyKey: string): Promise<{ providerMessageId: string } | null>;
  send(input: { idempotencyKey: string; subject: string; details: string }): Promise<{ providerMessageId: string }>;
}

const actionableKinds = new Set<NotificationKind>([
  "automatic-rollback",
  "rollback-failure",
  "terminal-publication-failure",
  "stuck-reconciliation",
  "missed-github-collection",
  "security-rejection",
]);

export class InMemoryNotificationOutbox implements NotificationLedger {
  readonly #notifications = new Map<string, NotificationRecord>();
  readonly #outbox = new Map<string, NotificationOutboxEntry>();

  async record(input: { kind: NotificationKind; subject: string; details: string; now: Date }): Promise<NotificationRecord> {
    if (!actionableKinds.has(input.kind)) throw new Error("notification-kind-not-actionable");
    const idempotencyKey = `notification:${sha256(canonicalJson({ kind: input.kind, subject: input.subject, details: input.details })).slice(7, 47)}`;
    const id = `ledger:${idempotencyKey}`;
    const existing = this.#notifications.get(id);
    if (existing) return clone(existing);
    const notification: NotificationRecord = {
      id,
      kind: input.kind,
      subject: input.subject,
      details: input.details,
      idempotencyKey,
      state: "pending",
      providerMessageId: null,
      createdAt: input.now.toISOString(),
    };
    const outbox: NotificationOutboxEntry = {
      id: `outbox:${idempotencyKey}`,
      notificationId: id,
      idempotencyKey,
      state: "pending",
      attempts: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      providerReference: null,
    };
    // This in-memory assignment is the conformance seam for the production transaction.
    this.#notifications.set(id, notification);
    this.#outbox.set(outbox.id, outbox);
    return clone(notification);
  }

  async leaseNext(owner: string, now: Date, expiresAt: Date) {
    const outbox = [...this.#outbox.values()].find((candidate) => candidate.state === "pending"
      || (candidate.state === "leased" && candidate.leaseExpiresAt !== null && new Date(candidate.leaseExpiresAt).getTime() <= now.getTime()));
    if (!outbox) return null;
    const leased: NotificationOutboxEntry = { ...outbox, state: "leased", attempts: outbox.attempts + 1, leaseOwner: owner, leaseExpiresAt: expiresAt.toISOString() };
    this.#outbox.set(leased.id, leased);
    return { notification: clone(this.#notifications.get(leased.notificationId)!), outbox: clone(leased) };
  }

  async delivered(input: { outboxId: string; owner: string; providerMessageId: string }): Promise<NotificationRecord> {
    const outbox = this.#outbox.get(input.outboxId);
    if (!outbox || outbox.state !== "leased" || outbox.leaseOwner !== input.owner) throw new Error("notification-outbox-lease-not-owned");
    const notification = this.#notifications.get(outbox.notificationId)!;
    if (notification.state === "delivered") {
      if (notification.providerMessageId !== input.providerMessageId) throw new Error("notification-provider-id-conflict");
      return clone(notification);
    }
    const delivered: NotificationRecord = { ...notification, state: "delivered", providerMessageId: input.providerMessageId };
    this.#notifications.set(delivered.id, delivered);
    this.#outbox.set(outbox.id, { ...outbox, state: "applied", providerReference: input.providerMessageId, leaseOwner: null, leaseExpiresAt: null });
    return clone(delivered);
  }

  async release(input: { outboxId: string; owner: string; terminal: boolean }): Promise<void> {
    const outbox = this.#outbox.get(input.outboxId);
    if (!outbox || outbox.state !== "leased" || outbox.leaseOwner !== input.owner) throw new Error("notification-outbox-lease-not-owned");
    const state = input.terminal ? "failed" as const : "pending" as const;
    this.#outbox.set(outbox.id, { ...outbox, state, leaseOwner: null, leaseExpiresAt: null });
    if (input.terminal) {
      const notification = this.#notifications.get(outbox.notificationId)!;
      this.#notifications.set(notification.id, { ...notification, state: "failed" });
    }
  }

  async snapshot() {
    return clone({ notifications: [...this.#notifications.values()], outbox: [...this.#outbox.values()] });
  }
}

export class NotificationWorker {
  constructor(private readonly dependencies: { ledger: NotificationLedger; resend: ResendPort; leaseMilliseconds?: number; maximumAttempts?: number }) {}

  async dispatchNext(worker: string, now: Date) {
    const leased = await this.dependencies.ledger.leaseNext(worker, now, new Date(now.getTime() + (this.dependencies.leaseMilliseconds ?? 30_000)));
    if (!leased) return null;
    try {
      const providerState = await reconcileProviderEffect({
        read: () => this.dependencies.resend.read(leased.notification.idempotencyKey),
        apply: () => this.dependencies.resend.send({
            idempotencyKey: leased.notification.idempotencyKey,
            subject: leased.notification.subject,
            details: leased.notification.details,
          }),
      });
      return await this.dependencies.ledger.delivered({ outboxId: leased.outbox.id, owner: worker, providerMessageId: providerState.providerMessageId });
    } catch {
      await this.dependencies.ledger.release({ outboxId: leased.outbox.id, owner: worker, terminal: leased.outbox.attempts >= (this.dependencies.maximumAttempts ?? 3) });
      return null;
    }
  }
}

export class RecoveryNotificationWorker {
  constructor(private readonly dependencies: { store: RecoveryStore; resend: ResendPort; leaseMilliseconds?: number; maximumAttempts?: number }) {}

  async dispatchNext(worker: string, now: Date) {
    const leased = await this.dependencies.store.leaseNextNotification(worker, now, new Date(now.getTime() + (this.dependencies.leaseMilliseconds ?? 30_000)));
    if (!leased) return null;
    try {
      const providerState = await reconcileProviderEffect({
        read: () => this.dependencies.resend.read(leased.notification.idempotencyKey),
        apply: () => this.dependencies.resend.send({ idempotencyKey: leased.notification.idempotencyKey, subject: leased.notification.subject, details: leased.notification.details }),
      });
      return await this.dependencies.store.notificationDelivered({ notificationId: leased.notification.id, outboxId: leased.outbox.id, owner: worker, providerMessageId: providerState.providerMessageId });
    } catch {
      await this.dependencies.store.releaseNotification({ outboxId: leased.outbox.id, owner: worker, terminal: leased.outbox.attempts >= (this.dependencies.maximumAttempts ?? 3) });
      return null;
    }
  }
}

export class InMemoryResendPort implements ResendPort {
  readonly #messages = new Map<string, { providerMessageId: string }>();
  #ambiguousResponses: number;
  readonly deliveries: { idempotencyKey: string; subject: string }[] = [];
  constructor(input: { ambiguousResponses?: number } = {}) { this.#ambiguousResponses = input.ambiguousResponses ?? 0; }
  async read(idempotencyKey: string) { return clone(this.#messages.get(idempotencyKey) ?? null); }
  async send(input: { idempotencyKey: string; subject: string; details: string }) {
    const existing = this.#messages.get(input.idempotencyKey);
    if (existing) return clone(existing);
    const sent = { providerMessageId: `resend:${sha256(canonicalJson(input)).slice(7, 31)}` };
    this.#messages.set(input.idempotencyKey, sent);
    this.deliveries.push({ idempotencyKey: input.idempotencyKey, subject: input.subject });
    if (this.#ambiguousResponses > 0) {
      this.#ambiguousResponses -= 1;
      throw new AmbiguousProviderResultError("resend-accepted-response-lost");
    }
    return clone(sent);
  }
}

export class FailClosedResendPort implements ResendPort {
  async read(idempotencyKey: string): Promise<never> {
    void idempotencyKey;
    throw new ProductionAdapterUnavailableError("resend-notification");
  }
  async send(input: { idempotencyKey: string; subject: string; details: string }): Promise<never> {
    void input;
    throw new ProductionAdapterUnavailableError("resend-notification");
  }
}
