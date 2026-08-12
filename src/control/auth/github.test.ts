import { describe, expect, it, vi } from "vitest";

import { GitHubOAuthIdentityProvider } from "./github";

describe("GitHub OAuth identity provider", () => {
  it("exchanges the callback code server-side and returns only the immutable numeric identity", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "gho_ephemeral", token_type: "bearer", scope: "" }),
      )
      .mockResolvedValueOnce(Response.json({ id: 31415926, login: "display-name-can-change" }));
    const provider = new GitHubOAuthIdentityProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      callbackUrl: "https://portfolio.example.com/api/auth/github/callback",
      fetch,
    });

    await expect(provider.identify("one-time-code")).resolves.toEqual({ numericId: "31415926" });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
    const exchangeBody = fetch.mock.calls[0]?.[1]?.body;
    expect(exchangeBody).toBeInstanceOf(URLSearchParams);
    expect(String(exchangeBody)).toContain("client_secret=client-secret");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/user",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer gho_ephemeral" }),
      }),
    );
  });

  it.each([
    ["failed exchange", [new Response(null, { status: 401 })]],
    ["missing access token", [Response.json({ token_type: "bearer" })]],
    ["failed identity lookup", [Response.json({ access_token: "token" }), new Response(null, { status: 500 })]],
    ["malformed identity", [Response.json({ access_token: "token" }), Response.json({ id: "not-numeric" })]],
  ])("fails closed for a %s without exposing provider detail", async (_label, responses) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (const response of responses) fetch.mockResolvedValueOnce(response);
    const provider = new GitHubOAuthIdentityProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      callbackUrl: "https://portfolio.example.com/api/auth/github/callback",
      fetch,
    });

    await expect(provider.identify("code")).rejects.toThrow("GitHub identity could not be verified.");
  });
});
