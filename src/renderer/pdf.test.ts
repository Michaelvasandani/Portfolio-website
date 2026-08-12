import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Public résumé PDF artifact", () => {
  it("is generated as a tagged PDF rather than a raw upload", () => {
    const path = "public/michael-vasandani-resume.pdf";
    expect(existsSync(path)).toBe(true);
    const pdf = readFileSync(path);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.includes(Buffer.from("/StructTreeRoot"))).toBe(true);
    expect(pdf.includes(Buffer.from("/Lang (en)"))).toBe(true);
  });
});
