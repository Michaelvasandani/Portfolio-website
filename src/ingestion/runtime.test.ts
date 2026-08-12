import { describe, expect, it, vi } from "vitest";

import { createCareerIngestionRuntime } from "./runtime";
import type { BlobUploadProvider, CareerSandbox } from "./service";
import { InMemoryCareerIngestionStore } from "./store";

const configuration = {
  APP_ENV: "production",
  CAREER_ALLOWED_EMAIL: "michael@example.com",
  CAREER_ALLOWED_GITHUB: "https://github.com/michael",
  CAREER_ALLOWED_LINKEDIN: "https://www.linkedin.com/in/michael",
};

const blob: BlobUploadProvider = {
  issueClientUploadGrant: vi.fn(),
  deletionState: vi.fn(),
  deleteRawBlob: vi.fn(),
};
const sandbox: CareerSandbox = { parse: vi.fn() };

describe("managed Career ingestion runtime", () => {
  it("fails closed when the contact allowlist is absent or malformed", () => {
    expect(createCareerIngestionRuntime({})).toEqual({
      available: false,
      reason: "Career ingestion is not configured.",
    });
    expect(
      createCareerIngestionRuntime({ ...configuration, CAREER_ALLOWED_GITHUB: "http://github.com/michael" }),
    ).toEqual({
      available: false,
      reason: "Career ingestion is not configured.",
    });
  });

  it.each([
    ["Neon store", { store: undefined }],
    ["private Blob", { blob: undefined }],
    ["pinned Sandbox", { sandbox: undefined }],
  ])("does not claim availability without the managed %s adapter", (_label, override) => {
    expect(
      createCareerIngestionRuntime(configuration, {
        store: new InMemoryCareerIngestionStore(),
        blob,
        sandbox,
        ...override,
      }),
    ).toEqual({
      available: false,
      reason: "Managed Career ingestion adapters are not connected.",
    });
  });

  it("constructs the application service only when every explicit provider boundary is injected", () => {
    const runtime = createCareerIngestionRuntime(configuration, {
      store: new InMemoryCareerIngestionStore(),
      blob,
      sandbox,
    });

    expect(runtime).toMatchObject({
      available: true,
      configuration: {
        environment: "production",
        contacts: {
          email: "michael@example.com",
          github: "https://github.com/michael",
          linkedin: "https://www.linkedin.com/in/michael",
        },
      },
    });
    if (!runtime.available) throw new Error("expected configured runtime");
    expect(runtime.service).toBeDefined();
  });
});
