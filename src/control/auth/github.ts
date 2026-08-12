import "server-only";

import { z } from "zod";

import type { GitHubIdentityProvider } from "./service";

type GitHubOAuthIdentityProviderInput = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  fetch?: typeof globalThis.fetch;
};

const tokenResponseSchema = z.object({ access_token: z.string().min(1) }).passthrough();
const identityResponseSchema = z.object({ id: z.number().int().positive().safe() }).passthrough();

export class GitHubOAuthIdentityProvider implements GitHubIdentityProvider {
  readonly #input: GitHubOAuthIdentityProviderInput;

  constructor(input: GitHubOAuthIdentityProviderInput) {
    this.#input = input;
  }

  async identify(code: string): Promise<{ numericId: string }> {
    try {
      const exchange = await (this.#input.fetch ?? globalThis.fetch)(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: this.#input.clientId,
            client_secret: this.#input.clientSecret,
            code,
            redirect_uri: this.#input.callbackUrl,
          }),
        },
      );
      if (!exchange.ok) throw new Error("exchange rejected");
      const token = tokenResponseSchema.parse(await exchange.json());

      const identityResponse = await (this.#input.fetch ?? globalThis.fetch)("https://api.github.com/user", {
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token.access_token}`,
          "User-Agent": "agentic-portfolio-owner-access",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!identityResponse.ok) throw new Error("identity rejected");
      const identity = identityResponseSchema.parse(await identityResponse.json());
      return { numericId: String(identity.id) };
    } catch {
      throw new Error("GitHub identity could not be verified.");
    }
  }
}
