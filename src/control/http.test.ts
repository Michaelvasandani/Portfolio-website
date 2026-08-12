import { describe, expect, it, vi } from "vitest";

import type { OwnerAccessRuntime } from "./auth/runtime";
import { OwnerAccessHttpController } from "./http";

describe("owner-access HTTP boundary", () => {
  it("returns a generic non-cacheable outage when the local/provider boundary is unavailable", async () => {
    const controller = new OwnerAccessHttpController(() => ({
      available: false,
      reason: "private setup detail",
    }));
    const response = await controller.start();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe("Owner access is unavailable.");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(body).not.toContain("private setup detail");
  });

  it("starts OAuth with an HTTP-only state binding cookie", async () => {
    const runtime = {
      available: true,
      configuration: { oauthLifetimeSeconds: 300 },
      service: {
        beginLogin: async () => ({
          authorizationUrl: "https://github.com/login/oauth/authorize?state=opaque",
          state: "state-sent-to-provider",
          stateBinding: "browser-binding",
          expiresAt: new Date(),
        }),
      },
      operations: {},
    } as unknown as OwnerAccessRuntime;
    const response = await new OwnerAccessHttpController(() => runtime).start();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("github.com/login/oauth/authorize");
    expect(response.headers.get("set-cookie")).toContain("__Host-portfolio-oauth=browser-binding");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("completes OAuth without exposing tokens in the redirect URL", async () => {
    const runtime = {
      available: true,
      configuration: {
        publicOrigin: "https://portfolio.example.com",
        sessionLifetimeSeconds: 900,
      },
      service: {
        completeLogin: async () => ({
          sessionToken: "opaque-session",
          csrfToken: "opaque-csrf",
          expiresAt: new Date(),
        }),
      },
      operations: {},
    } as unknown as OwnerAccessRuntime;
    const response = await new OwnerAccessHttpController(() => runtime).callback(
      new Request("https://portfolio.example.com/api/auth/github/callback?code=code&state=state", {
        headers: { Cookie: "__Host-portfolio-oauth=binding" },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://portfolio.example.com/control");
    expect(response.headers.get("location")).not.toMatch(/opaque|code|state/);
    expect(response.headers.get("set-cookie")).toContain("__Host-portfolio-session=opaque-session");
    expect(response.headers.get("set-cookie")).toContain("__Host-portfolio-csrf=opaque-csrf");
  });

  it("validates logout as a CSRF-protected mutation and expires browser credentials", async () => {
    const logout = vi.fn(async () => undefined);
    const runtime = {
      available: true,
      configuration: { publicOrigin: "https://portfolio.example.com" },
      service: { logout },
      operations: {},
    } as unknown as OwnerAccessRuntime;
    const response = await new OwnerAccessHttpController(() => runtime).logout(
      new Request("https://portfolio.example.com/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: "__Host-portfolio-session=session; __Host-portfolio-csrf=csrf",
          Origin: "https://portfolio.example.com",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "csrfToken=csrf",
      }),
    );

    expect(logout).toHaveBeenCalledWith({
      sessionToken: "session",
      csrfToken: "csrf",
      origin: "https://portfolio.example.com",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("conceals private APIs when no valid owner session is present", async () => {
    const runtime = {
      available: true,
      service: { verifySession: async () => Promise.reject(new Error("private diagnostic")) },
      operations: { read: async () => Promise.reject(new Error("must not read")) },
      configuration: {},
    } as unknown as OwnerAccessRuntime;
    const controller = new OwnerAccessHttpController(() => runtime);
    const response = await controller.status(
      new Request("https://portfolio.example.com/api/control/status/deployments"),
      "deployments",
    );
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).toBe("Not found");
    expect(body).not.toContain("private diagnostic");
  });

  it("rejects unknown operational sections as concealed not-found responses", async () => {
    const controller = new OwnerAccessHttpController(() => ({
      available: false,
      reason: "not configured",
    }));
    const response = await controller.status(new Request("https://portfolio.example.com/api/control/status/secret"), "secret");
    expect(response.status).toBe(404);
  });
});
