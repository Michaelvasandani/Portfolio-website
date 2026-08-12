import { createHmac, randomBytes } from "node:crypto";

import { equalDigest } from "./digest";
import type { OwnerAccessStore } from "./store";

export type OwnerAccessConfiguration = {
  clientId: string;
  callbackUrl: string;
  ownerNumericId: string;
  publicOrigin: string;
  sessionSecret: string;
  oauthLifetimeSeconds: number;
  sessionLifetimeSeconds: number;
};

export interface GitHubIdentityProvider {
  identify(code: string): Promise<{ numericId: string }>;
}

export type OwnerAccessErrorCode =
  | "access-denied"
  | "callback-invalid"
  | "csrf-invalid"
  | "oauth-state-invalid"
  | "session-invalid";

export class OwnerAccessError extends Error {
  constructor(readonly code: OwnerAccessErrorCode) {
    super("Owner access could not be verified.");
    this.name = "OwnerAccessError";
  }
}

type OwnerAccessServiceDependencies = {
  config: OwnerAccessConfiguration;
  store: OwnerAccessStore;
  provider: GitHubIdentityProvider;
  now?: () => Date;
  randomToken?: () => string;
};

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

export class OwnerAccessService {
  readonly #config: OwnerAccessConfiguration;
  readonly #store: OwnerAccessStore;
  readonly #provider: GitHubIdentityProvider;
  readonly #now: () => Date;
  readonly #randomToken: () => string;

  constructor(dependencies: OwnerAccessServiceDependencies) {
    this.#config = dependencies.config;
    this.#store = dependencies.store;
    this.#provider = dependencies.provider;
    this.#now = dependencies.now ?? (() => new Date());
    this.#randomToken = dependencies.randomToken ?? (() => randomBytes(32).toString("base64url"));
    if (!isNumericId(this.#config.ownerNumericId)) {
      throw new Error("The configured GitHub owner ID must be numeric.");
    }
  }

  #digest(value: string): string {
    return createHmac("sha256", this.#config.sessionSecret).update(value).digest("hex");
  }

  async #audit(input: {
    action: "oauth.login" | "session.logout" | "session.mutation" | "session.verify";
    outcome: "allowed" | "denied";
    reason: string;
    actorId?: string;
  }): Promise<void> {
    await this.#store.appendAudit({
      action: input.action,
      outcome: input.outcome,
      reason: input.reason,
      actorFingerprint: input.actorId ? this.#digest(`actor:${input.actorId}`).slice(0, 16) : undefined,
      occurredAt: this.#now(),
    });
  }

  async beginLogin(): Promise<{
    authorizationUrl: string;
    state: string;
    stateBinding: string;
    expiresAt: Date;
  }> {
    const state = this.#randomToken();
    const stateBinding = this.#randomToken();
    const expiresAt = new Date(this.#now().getTime() + this.#config.oauthLifetimeSeconds * 1_000);
    await this.#store.createOAuthAttempt({
      stateDigest: this.#digest(`state:${state}`),
      bindingDigest: this.#digest(`binding:${stateBinding}`),
      expiresAt,
    });
    const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", this.#config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", this.#config.callbackUrl);
    authorizationUrl.searchParams.set("state", state);
    return { authorizationUrl: authorizationUrl.toString(), state, stateBinding, expiresAt };
  }

  async completeLogin(input: {
    code: string;
    state: string;
    stateBinding: string;
  }): Promise<{ sessionToken: string; csrfToken: string; expiresAt: Date }> {
    const stateAccepted =
      Boolean(input.state && input.stateBinding) &&
      (await this.#store.consumeOAuthAttempt({
        stateDigest: this.#digest(`state:${input.state}`),
        bindingDigest: this.#digest(`binding:${input.stateBinding}`),
        now: this.#now(),
      }));
    if (!stateAccepted) {
      await this.#audit({ action: "oauth.login", outcome: "denied", reason: "oauth-state-invalid" });
      throw new OwnerAccessError("oauth-state-invalid");
    }
    if (!input.code) {
      await this.#audit({ action: "oauth.login", outcome: "denied", reason: "callback-invalid" });
      throw new OwnerAccessError("callback-invalid");
    }

    let identity: { numericId: string };
    try {
      identity = await this.#provider.identify(input.code);
    } catch {
      await this.#audit({ action: "oauth.login", outcome: "denied", reason: "callback-invalid" });
      throw new OwnerAccessError("callback-invalid");
    }
    if (!isNumericId(identity.numericId)) {
      await this.#audit({ action: "oauth.login", outcome: "denied", reason: "callback-invalid" });
      throw new OwnerAccessError("callback-invalid");
    }
    if (identity.numericId !== this.#config.ownerNumericId) {
      await this.#audit({
        action: "oauth.login",
        outcome: "denied",
        reason: "identity-not-authorized",
        actorId: identity.numericId,
      });
      throw new OwnerAccessError("access-denied");
    }

    const sessionToken = this.#randomToken();
    const csrfToken = this.#randomToken();
    const expiresAt = new Date(this.#now().getTime() + this.#config.sessionLifetimeSeconds * 1_000);
    await this.#store.createSession({
      tokenDigest: this.#digest(`session:${sessionToken}`),
      csrfDigest: this.#digest(`csrf:${csrfToken}`),
      ownerFingerprint: this.#digest(`actor:${identity.numericId}`).slice(0, 16),
      expiresAt,
      revokedAt: null,
    });
    await this.#audit({
      action: "oauth.login",
      outcome: "allowed",
      reason: "owner-authorized",
      actorId: identity.numericId,
    });
    return { sessionToken, csrfToken, expiresAt };
  }

  async #activeSession(
    sessionToken: string,
    action: "session.mutation" | "session.verify",
  ) {
    if (!sessionToken) {
      await this.#audit({ action, outcome: "denied", reason: "session-missing" });
      throw new OwnerAccessError("session-invalid");
    }
    const session = await this.#store.findSession(this.#digest(`session:${sessionToken}`));
    if (!session) {
      await this.#audit({ action, outcome: "denied", reason: "session-unknown" });
      throw new OwnerAccessError("session-invalid");
    }
    if (session.revokedAt) {
      await this.#store.appendAudit({
        action,
        outcome: "denied",
        reason: "session-revoked",
        actorFingerprint: session.ownerFingerprint,
        occurredAt: this.#now(),
      });
      throw new OwnerAccessError("session-invalid");
    }
    if (session.expiresAt.getTime() <= this.#now().getTime()) {
      await this.#store.appendAudit({
        action,
        outcome: "denied",
        reason: "session-expired",
        actorFingerprint: session.ownerFingerprint,
        occurredAt: this.#now(),
      });
      throw new OwnerAccessError("session-invalid");
    }
    return session;
  }

  async verifySession(sessionToken: string): Promise<{ owner: true }> {
    await this.#activeSession(sessionToken, "session.verify");
    return { owner: true };
  }

  async authorizeMutation(input: {
    sessionToken: string;
    csrfToken: string;
    origin: string | null;
  }): Promise<{ owner: true }> {
    const session = await this.#activeSession(input.sessionToken, "session.mutation");
    if (
      input.origin !== this.#config.publicOrigin ||
      !input.csrfToken ||
      !equalDigest(this.#digest(`csrf:${input.csrfToken}`), session.csrfDigest)
    ) {
      await this.#store.appendAudit({
        action: "session.mutation",
        outcome: "denied",
        reason: "csrf-invalid",
        actorFingerprint: session.ownerFingerprint,
        occurredAt: this.#now(),
      });
      throw new OwnerAccessError("csrf-invalid");
    }
    return { owner: true };
  }

  async logout(input: {
    sessionToken: string;
    csrfToken: string;
    origin: string | null;
  }): Promise<void> {
    await this.authorizeMutation(input);
    await this.#store.revokeSession(this.#digest(`session:${input.sessionToken}`), this.#now());
    await this.#audit({ action: "session.logout", outcome: "allowed", reason: "owner-requested" });
  }
}
