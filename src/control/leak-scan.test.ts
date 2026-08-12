import { describe, expect, it } from "vitest";

import { scanOwnerAccessPublicArtifacts } from "./leak-scan";

describe("owner-access public artifact leak scan", () => {
  it("accepts public output that contains only the allowlisted projection", () => {
    expect(
      scanOwnerAccessPublicArtifacts(
        [{ path: "public.html", content: "<h1>Michael Sagar Vasandani</h1>" }],
        ["configured-secret", "31415926"],
      ),
    ).toEqual([]);
  });

  it.each([
    ["configured literal", "configured-secret", "configured literal"],
    ["OAuth token", "gho_abcdefghijklmnopqrstuvwxyz123456", "credential pattern"],
    ["session field", "sessionToken", "privileged field name"],
    ["private API", "/api/control/status/deployments", "control endpoint"],
    ["database URL", "postgresql://user:pass@db.example.test/db", "credential pattern"],
  ])("reports a %s", (_label, content, category) => {
    expect(
      scanOwnerAccessPublicArtifacts([{ path: "chunk.js", content }], ["configured-secret"]),
    ).toContainEqual({ path: "chunk.js", category });
  });
});
