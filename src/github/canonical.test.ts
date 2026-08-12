import { describe, expect, it } from "vitest";

import { canonicalJson, sha256 } from "./canonical";

describe("GitHub evidence canonicalization", () => {
  it("sorts object keys without changing array order", () => {
    expect(canonicalJson({ z: 1, nested: { b: true, a: null }, order: ["two", "one"] })).toBe(
      '{"nested":{"a":null,"b":true},"order":["two","one"],"z":1}',
    );
  });

  it("returns the versioned sha256 representation used by immutable contracts", () => {
    expect(sha256("portfolio")).toBe(
      "sha256:0e6a8e0b849ed9b064c5a25e1ee5592f427e3eb9d250e42069ce46147d00e8d4",
    );
  });
});
