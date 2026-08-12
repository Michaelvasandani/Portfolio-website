import { describe, expect, it, vi } from "vitest";

import { CareerIngestionHttpController } from "./http";
import type { CareerIngestionRuntime } from "./runtime";

const grant = {
  intentId: "upload:one",
  uploadUrl: "https://blob.example.test/upload",
  token: "opaque-upload-token",
  objectKey: "raw-career/upload:one/resume.md",
  contentType: "text/markdown",
  maximumBytes: 10 * 1024 * 1024,
  expiresAt: new Date("2026-08-12T19:05:00.000Z"),
  publicProjectionWarning:
    "Uploaded content is intended for public projection. Exclude employer-confidential narrative.",
};

function runtime(service: { issueUpload?: unknown; completeUpload?: unknown }): CareerIngestionRuntime {
  return {
    available: true,
    configuration: {
      environment: "test",
      contacts: {
        email: "michael@example.com",
        github: "https://github.com/michael",
        linkedin: "https://linkedin.com/in/michael",
      },
    },
    service,
    maintenance: {
      run: vi.fn().mockResolvedValue({ expiredIntents: 1, deletionId: "deletion:one", deletionState: "stuck" }),
      status: vi.fn().mockResolvedValue({ pending: 0, leased: 0, applied: 1, stuck: 1, pendingNotifications: 1 }),
    },
  } as unknown as CareerIngestionRuntime;
}

describe("private Career ingestion HTTP boundary", () => {
  it("authorizes and validates a token request before returning only the constrained grant DTO", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const issueUpload = vi.fn().mockResolvedValue(grant);
    const controller = new CareerIngestionHttpController({
      authorize,
      runtime: () => runtime({ issueUpload }),
    });
    const request = new Request("https://portfolio.example.com/api/control/uploads/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "resume.md",
        declaredType: "text/markdown",
        size: 2_048,
        expectedHash: `sha256:${"a".repeat(64)}`,
      }),
    });

    const response = await controller.issue(request);

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      ...grant,
      expiresAt: grant.expiresAt.toISOString(),
    });
    expect(authorize).toHaveBeenCalledWith(request);
    expect(issueUpload).toHaveBeenCalledWith({
      filename: "resume.md",
      declaredType: "text/markdown",
      size: 2_048,
      expectedHash: `sha256:${"a".repeat(64)}`,
    });
  });

  it("rejects undeclared raw content at the HTTP boundary", async () => {
    const issueUpload = vi.fn();
    const controller = new CareerIngestionHttpController({
      authorize: vi.fn().mockResolvedValue(undefined),
      runtime: () => runtime({ issueUpload }),
    });
    const rawMarker = "raw resume text";
    const response = await controller.issue(
      new Request("https://portfolio.example.com/api/control/uploads/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "resume.md",
          declaredType: "text/markdown",
          size: 2_048,
          expectedHash: `sha256:${"a".repeat(64)}`,
          rawContent: rawMarker,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(rawMarker);
    expect(issueUpload).not.toHaveBeenCalled();
  });

  it("conceals unauthenticated requests and provider configuration detail", async () => {
    const denied = new CareerIngestionHttpController({
      authorize: vi.fn().mockRejectedValue(new Error("private auth detail")),
      runtime: () => ({ available: false, reason: "private provider detail" }),
    });
    const request = new Request("https://portfolio.example.com/api/control/uploads/intent", {
      method: "POST",
      body: "{}",
    });
    const deniedResponse = await denied.issue(request);
    expect(deniedResponse.status).toBe(404);
    expect(await deniedResponse.text()).toBe("");

    const unavailable = new CareerIngestionHttpController({
      authorize: vi.fn().mockResolvedValue(undefined),
      runtime: () => ({ available: false, reason: "private provider detail" }),
    });
    const unavailableResponse = await unavailable.issue(request);
    expect(unavailableResponse.status).toBe(503);
    expect(await unavailableResponse.text()).toBe("Career ingestion is unavailable.");
  });

  it("returns a minimal accepted outcome after the authenticated completion request", async () => {
    const completeUpload = vi.fn().mockResolvedValue({
      decision: "accepted",
      duplicate: false,
      snapshotId: "career:1234567890abcdef12345678",
    });
    const controller = new CareerIngestionHttpController({
      authorize: vi.fn().mockResolvedValue(undefined),
      runtime: () => runtime({ completeUpload }),
    });
    const response = await controller.complete(
      new Request("https://portfolio.example.com/api/control/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId: "upload:one",
          objectKey: "raw-career/upload:one/resume.md",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      decision: "accepted",
      duplicate: false,
      snapshotId: "career:1234567890abcdef12345678",
    });
  });

  it("runs cleanup through an authenticated executable endpoint and exposes only aggregate status", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const configured = runtime({});
    const controller = new CareerIngestionHttpController({ authorize, runtime: () => configured });
    const maintenanceRequest = new Request("https://portfolio.example.com/api/control/uploads/maintenance", { method: "POST" });
    const statusRequest = new Request("https://portfolio.example.com/api/control/uploads/status");

    const maintenanceResponse = await controller.maintain(maintenanceRequest);
    const statusResponse = await controller.status(statusRequest);

    expect(maintenanceResponse.status).toBe(200);
    await expect(maintenanceResponse.json()).resolves.toEqual({
      expiredIntents: 1,
      deletionId: "deletion:one",
      deletionState: "stuck",
    });
    await expect(statusResponse.json()).resolves.toEqual({
      pending: 0,
      leased: 0,
      applied: 1,
      stuck: 1,
      pendingNotifications: 1,
    });
    expect(authorize).toHaveBeenCalledTimes(2);
  });
});
