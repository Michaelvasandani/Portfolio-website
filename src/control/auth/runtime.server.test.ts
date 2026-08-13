import { describe, expect, it } from "vitest";

import { UnavailableOperationalControls, UnavailableOperationalRepository } from "../operations";
import { InMemoryOwnerAccessStore } from "./store";
import { getOwnerAccessRuntime, installOwnerAccessRuntimeResources } from "./runtime.server";

describe("owner runtime production composition", () => {
  it("wires persistent operational reads and commands when live resources are installed", () => {
    const operations = new UnavailableOperationalRepository("injected operations");
    const controls = new UnavailableOperationalControls();
    installOwnerAccessRuntimeResources({ authStore: new InMemoryOwnerAccessStore(), operations, controls }, {
      APP_ENV: "production",
      PUBLIC_ORIGIN: "https://portfolio.example.com",
      GITHUB_APP_CLIENT_ID: "Iv1.example",
      GITHUB_APP_CLIENT_SECRET: "github-client-secret-at-least-32-characters",
      GITHUB_OWNER_NUMERIC_ID: "31415926",
      OWNER_SESSION_SECRET: "owner-session-secret-at-least-32-characters",
    });

    const runtime = getOwnerAccessRuntime();
    expect(runtime.available).toBe(true);
    if (runtime.available) {
      expect(runtime.operations).toBe(operations);
      expect(runtime.controls).toBe(controls);
    }
  });
});
