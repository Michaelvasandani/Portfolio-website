import { describe, expect, it } from "vitest";

import { operationalSections, UnavailableOperationalRepository } from "./operations";

describe("operational shell", () => {
  it("inventories every planned operational entity", () => {
    expect(operationalSections.map(({ slug }) => slug)).toEqual([
      "upload",
      "publication-runs",
      "deployments",
      "checks",
      "served-version",
      "breaker",
      "restore-retry",
      "source-freshness",
      "raw-deletion",
      "outbox",
      "notifications",
    ]);
  });

  it("reports an explicit unavailable state instead of fabricating operational success", async () => {
    const repository = new UnavailableOperationalRepository("Managed control-plane persistence is not connected.");

    for (const section of operationalSections) {
      await expect(repository.read(section.slug)).resolves.toEqual({
        slug: section.slug,
        label: section.label,
        state: "unavailable",
        summary: "Managed control-plane persistence is not connected.",
        records: [],
      });
    }
  });
});
