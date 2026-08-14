import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("deployment toolchain contract", () => {
  it("accepts Vercel-managed Node 22 patches while preserving the exact local pin", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      engines: { node: string };
    };

    expect(packageJson.engines.node).toBe("22.x");
    expect(readFileSync(".nvmrc", "utf8").trim()).toBe("22.23.1");
  });
});
