import { equalDigest } from "./digest";
export type OAuthAttempt = {
  stateDigest: string;
  bindingDigest: string;
  expiresAt: Date;
};

export type OwnerSession = {
  tokenDigest: string;
  csrfDigest: string;
  ownerFingerprint: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type OwnerAuditEvent = {
  action: "oauth.login" | "session.logout" | "session.mutation" | "session.verify";
  outcome: "allowed" | "denied";
  reason: string;
  actorFingerprint?: string;
  occurredAt: Date;
};

export interface OwnerAccessStore {
  createOAuthAttempt(attempt: OAuthAttempt): Promise<void>;
  consumeOAuthAttempt(input: {
    stateDigest: string;
    bindingDigest: string;
    now: Date;
  }): Promise<boolean>;
  createSession(session: OwnerSession): Promise<void>;
  findSession(tokenDigest: string): Promise<OwnerSession | null>;
  revokeSession(tokenDigest: string, revokedAt: Date): Promise<void>;
  appendAudit(event: OwnerAuditEvent): Promise<void>;
}

export class InMemoryOwnerAccessStore implements OwnerAccessStore {
  readonly #oauthAttempts = new Map<string, OAuthAttempt>();
  readonly #sessions = new Map<string, OwnerSession>();
  readonly #audit: OwnerAuditEvent[] = [];

  async createOAuthAttempt(attempt: OAuthAttempt): Promise<void> {
    this.#oauthAttempts.set(attempt.stateDigest, structuredClone(attempt));
  }

  async consumeOAuthAttempt(input: {
    stateDigest: string;
    bindingDigest: string;
    now: Date;
  }): Promise<boolean> {
    const attempt = this.#oauthAttempts.get(input.stateDigest);
    if (!attempt) return false;
    this.#oauthAttempts.delete(input.stateDigest);
    return equalDigest(attempt.bindingDigest, input.bindingDigest) && attempt.expiresAt.getTime() > input.now.getTime();
  }

  async createSession(session: OwnerSession): Promise<void> {
    this.#sessions.set(session.tokenDigest, structuredClone(session));
  }

  async findSession(tokenDigest: string): Promise<OwnerSession | null> {
    const session = this.#sessions.get(tokenDigest);
    return session ? structuredClone(session) : null;
  }

  async revokeSession(tokenDigest: string, revokedAt: Date): Promise<void> {
    const session = this.#sessions.get(tokenDigest);
    if (session) session.revokedAt = revokedAt;
  }

  async appendAudit(event: OwnerAuditEvent): Promise<void> {
    this.#audit.push(structuredClone(event));
  }

  auditEvents(): OwnerAuditEvent[] {
    return structuredClone(this.#audit);
  }

  rawState(): string {
    return JSON.stringify({
      oauthAttempts: [...this.#oauthAttempts.values()],
      sessions: [...this.#sessions.values()],
      audit: this.#audit,
    });
  }
}
