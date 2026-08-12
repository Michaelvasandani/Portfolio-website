import { describe, expect, it } from "vitest";

import { InMemoryOwnerAccessStore } from "./store";
import { OwnerAccessError, OwnerAccessService, type GitHubIdentityProvider } from "./service";

const config = {
  clientId: "github-client-id",
  callbackUrl: "https://portfolio.example.com/api/auth/github/callback",
  ownerNumericId: "31415926",
  publicOrigin: "https://portfolio.example.com",
  sessionSecret: "test-session-secret-that-is-longer-than-thirty-two-bytes",
  oauthLifetimeSeconds: 300,
  sessionLifetimeSeconds: 900,
} as const;

function harness(identity: string = config.ownerNumericId) {
  let now = new Date("2026-08-12T16:00:00.000Z");
  let randomCounter = 0;
  const store = new InMemoryOwnerAccessStore();
  const provider: GitHubIdentityProvider = {
    async identify(code) {
      if (code === "forged") throw new Error("provider rejected code");
      return { numericId: identity };
    },
  };
  const service = new OwnerAccessService({
    config,
    store,
    provider,
    now: () => now,
    randomToken: () => `opaque-test-token-${++randomCounter}`,
  });
  return {
    service,
    store,
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

async function login(service: OwnerAccessService) {
  const start = await service.beginLogin();
  const callback = await service.completeLogin({
    code: "valid-code",
    state: start.state,
    stateBinding: start.stateBinding,
  });
  return { start, callback };
}

describe("owner access", () => {
  it("authenticates only the configured immutable numeric GitHub identity", async () => {
    const { service, store } = harness();
    const { start, callback } = await login(service);

    expect(start.authorizationUrl).toBe(
      `https://github.com/login/oauth/authorize?client_id=github-client-id&redirect_uri=${encodeURIComponent(config.callbackUrl)}&state=${encodeURIComponent(start.state)}`,
    );
    await expect(service.verifySession(callback.sessionToken)).resolves.toEqual({ owner: true });
    expect(callback.expiresAt).toEqual(new Date("2026-08-12T16:15:00.000Z"));
    expect(store.auditEvents()).toMatchObject([
      { action: "oauth.login", outcome: "allowed", reason: "owner-authorized" },
    ]);
    expect(JSON.stringify(store.auditEvents())).not.toContain(config.ownerNumericId);
    expect(store.rawState()).not.toContain(callback.sessionToken);
  });

  it("denies and audits a different valid GitHub identity without retaining its raw ID", async () => {
    const { service, store } = harness("27182818");
    const start = await service.beginLogin();

    await expect(
      service.completeLogin({ code: "valid-code", state: start.state, stateBinding: start.stateBinding }),
    ).rejects.toMatchObject({ code: "access-denied" });
    expect(store.auditEvents()).toMatchObject([
      { action: "oauth.login", outcome: "denied", reason: "identity-not-authorized" },
    ]);
    expect(JSON.stringify(store.auditEvents())).not.toContain("27182818");
  });

  it.each([
    ["mismatched state binding", { state: "state", stateBinding: "wrong-binding" }, "oauth-state-invalid"],
    ["missing callback code", { code: "" }, "callback-invalid"],
    ["a forged provider callback", { code: "forged" }, "callback-invalid"],
  ])("rejects %s", async (_label, override, expectedCode) => {
    const { service } = harness();
    const start = await service.beginLogin();
    await expect(
      service.completeLogin({
        code: "valid-code",
        state: start.state,
        stateBinding: start.stateBinding,
        ...override,
      }),
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it("rejects replayed and expired OAuth state", async () => {
    const replay = harness();
    const replayStart = await replay.service.beginLogin();
    await replay.service.completeLogin({
      code: "valid-code",
      state: replayStart.state,
      stateBinding: replayStart.stateBinding,
    });
    await expect(
      replay.service.completeLogin({
        code: "valid-code",
        state: replayStart.state,
        stateBinding: replayStart.stateBinding,
      }),
    ).rejects.toMatchObject({ code: "oauth-state-invalid" });

    const expired = harness();
    const expiredStart = await expired.service.beginLogin();
    expired.advance(301_000);
    await expect(
      expired.service.completeLogin({
        code: "valid-code",
        state: expiredStart.state,
        stateBinding: expiredStart.stateBinding,
      }),
    ).rejects.toMatchObject({ code: "oauth-state-invalid" });
  });

  it("rejects expired and forged sessions", async () => {
    const { service, store, advance } = harness();
    const { callback } = await login(service);

    await expect(service.verifySession(`${callback.sessionToken}-forged`)).rejects.toMatchObject({
      code: "session-invalid",
    });
    advance(901_000);
    await expect(service.verifySession(callback.sessionToken)).rejects.toMatchObject({
      code: "session-invalid",
    });
    expect(store.auditEvents().slice(-2)).toMatchObject([
      { action: "session.verify", outcome: "denied", reason: "session-unknown" },
      { action: "session.verify", outcome: "denied", reason: "session-expired" },
    ]);
  });

  it.each([
    ["a missing CSRF token", { csrfToken: "" }],
    ["a forged CSRF token", { csrfToken: "forged" }],
    ["a cross-origin request", { origin: "https://attacker.example" }],
    ["a missing origin", { origin: null }],
  ])("rejects %s", async (_label, override) => {
    const { service, store } = harness();
    const { callback } = await login(service);
    await expect(
      service.authorizeMutation({
        sessionToken: callback.sessionToken,
        csrfToken: callback.csrfToken,
        origin: config.publicOrigin,
        ...override,
      }),
    ).rejects.toMatchObject({ code: "csrf-invalid" });
    expect(store.auditEvents().at(-1)).toMatchObject({
      action: "session.mutation",
      outcome: "denied",
      reason: "csrf-invalid",
    });
  });

  it("authorizes same-origin mutations and makes logout immediately revoke the session", async () => {
    const { service, store } = harness();
    const { callback } = await login(service);

    await expect(
      service.authorizeMutation({
        sessionToken: callback.sessionToken,
        csrfToken: callback.csrfToken,
        origin: config.publicOrigin,
      }),
    ).resolves.toEqual({ owner: true });
    await service.logout({
      sessionToken: callback.sessionToken,
      csrfToken: callback.csrfToken,
      origin: config.publicOrigin,
    });
    await expect(service.verifySession(callback.sessionToken)).rejects.toMatchObject({
      code: "session-invalid",
    });
    expect(store.auditEvents()).toContainEqual(expect.objectContaining({
      action: "session.logout",
      outcome: "allowed",
      reason: "owner-requested",
    }));
    expect(store.auditEvents().at(-1)).toMatchObject({
      action: "session.verify",
      outcome: "denied",
      reason: "session-revoked",
    });
  });

  it("uses a single generic error message for all externally rejected credentials", () => {
    expect(new OwnerAccessError("oauth-state-invalid").message).toBe("Owner access could not be verified.");
    expect(new OwnerAccessError("access-denied").message).toBe("Owner access could not be verified.");
    expect(new OwnerAccessError("session-invalid").message).toBe("Owner access could not be verified.");
  });
});
