import { describe, expect, it } from "vitest";

import {
  transitionDeployment,
  transitionPublicationRun,
} from "./transitions";

describe("Publication run transitions", () => {
  const path = [
    "queued",
    "ingesting",
    "normalizing",
    "reconciling",
    "selecting",
    "generating",
    "rendering",
    "validating",
    "deploying-preview",
    "validating-preview",
    "promoting",
    "verifying-production",
    "finalizing",
    "succeeded",
  ] as const;

  it("advances through every leased publication step in order", () => {
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(transitionPublicationRun(path[index]!, path[index + 1]!)).toBe(path[index + 1]);
    }
  });

  it("allows an active step to terminalize as failed", () => {
    expect(transitionPublicationRun("validating", "failed")).toBe("failed");
  });

  it("rejects skipped and post-terminal transitions", () => {
    expect(() => transitionPublicationRun("queued", "generating")).toThrow(/illegal/i);
    expect(() => transitionPublicationRun("succeeded", "queued")).toThrow(/illegal/i);
    expect(() => transitionPublicationRun("failed", "queued")).toThrow(/illegal/i);
  });
});

describe("Deployment transitions", () => {
  it("promotes only a validated preview and marks it valid after production verification", () => {
    expect(transitionDeployment("preview", "validating")).toBe("validating");
    expect(transitionDeployment("validating", "promoted")).toBe("promoted");
    expect(transitionDeployment("promoted", "valid")).toBe("valid");
  });

  it("allows failed promoted or valid deployments to be quarantined", () => {
    expect(transitionDeployment("promoted", "quarantined")).toBe("quarantined");
    expect(transitionDeployment("valid", "quarantined")).toBe("quarantined");
  });

  it("rejects promotion skips and reuse of quarantined deployments", () => {
    expect(() => transitionDeployment("preview", "promoted")).toThrow(/illegal/i);
    expect(() => transitionDeployment("quarantined", "promoted")).toThrow(/illegal/i);
  });
});
