import { describe, expect, it } from "vitest";

import {
  concealedPrivateResponse,
  csrfCookie,
  oauthStateCookie,
  ownerSessionCookie,
  redactPrivilegedFields,
  safeOperationalView,
} from "./security";

describe("control-plane response security", () => {
  it("sets short-lived secure HTTP-only cookies", () => {
    expect(oauthStateCookie("binding", 300)).toEqual({
      name: "__Host-portfolio-oauth",
      value: "binding",
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 300,
        priority: "high",
      },
    });
    expect(ownerSessionCookie("session", 900)).toEqual({
      name: "__Host-portfolio-session",
      value: "session",
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: 900,
        priority: "high",
      },
    });
    expect(csrfCookie("csrf", 900)).toMatchObject({
      name: "__Host-portfolio-csrf",
      value: "csrf",
      options: { httpOnly: true, secure: true, sameSite: "strict", maxAge: 900 },
    });
  });

  it("conceals private route and diagnostic existence with a non-cacheable generic response", async () => {
    const response = concealedPrivateResponse();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("allowlists shell fields and redacts nested privileged values", () => {
    const source = {
      label: "Deployments",
      state: "unavailable",
      detail: "No managed store is connected.",
      accessToken: "gho_private",
      databaseUrl: "postgresql://private",
      nested: { sessionToken: "opaque", safeCount: 0 },
      rows: [
        { id: "private-run-id", status: "failed", evidenceGraph: { private: true } },
        { label: "provider result", value: "Bearer private-provider-token" },
      ],
    };

    expect(redactPrivilegedFields(source)).toEqual({
      label: "Deployments",
      state: "unavailable",
      detail: "No managed store is connected.",
      accessToken: "[redacted]",
      databaseUrl: "[redacted]",
      nested: { sessionToken: "[redacted]", safeCount: 0 },
      rows: [
        { id: "[redacted]", status: "failed", evidenceGraph: "[redacted]" },
        { label: "provider result", value: "[redacted]" },
      ],
    });
  });

  it("projects operational repository data into an explicit minimal DTO", () => {
    const view = {
      slug: "deployments" as const,
      label: "Deployments",
      state: "empty" as const,
      summary: "No deployment records.",
      records: [
        { label: "Deployment ID", value: "private-deployment-id" },
        { label: "Outcome", value: "No recorded outcome" },
      ],
      databaseUrl: "postgresql://private",
    };

    expect(safeOperationalView(view)).toEqual({
      slug: "deployments",
      label: "Deployments",
      state: "empty",
      summary: "No deployment records.",
      records: [
        { label: "Deployment ID", value: "[redacted]" },
        { label: "Outcome", value: "No recorded outcome" },
      ],
    });
  });
});
