import { describe, expect, it } from "vitest";

import { renderOperatorHandoff } from "./handoff";
import type { ProductionQualificationReport } from "./service";

describe("renderOperatorHandoff", () => {
  it("renders owners, blocked actions, evidence locations, and the no-waiver boundary", () => {
    const report: ProductionQualificationReport = {
      schemaVersion: 1,
      generatedAt: "2026-08-12T20:00:00.000Z",
      outcome: "incomplete",
      audit: {
        orphanRequirements: [],
        unsupportedTraceabilityRequirements: [],
        unsupportedTicketRequirements: [],
        missingDependencies: [],
        invalidTicketStatuses: [],
        requirementsWithoutTickets: [],
        missingTicketEvidence: [],
        unknownEvidenceItems: [],
        duplicateEvidenceItems: [],
        missingPackageArtifacts: [],
        brokenPackageLinks: [],
        missingRunbookChecklists: [],
      },
      incompletePriorTickets: ["02"],
      incompleteEvidence: [
        { itemId: "signed-handoff", reasons: ["evidence outcome is pending"] },
      ],
      evidence: [
        {
          itemId: "signed-handoff",
          outcome: "pending",
          scope: "production",
          artifactPointers: [],
          claims: [],
        },
      ],
    };

    const markdown = renderOperatorHandoff(report);

    expect(markdown).toContain("Michael");
    expect(markdown).toContain("signed-handoff");
    expect(markdown).toContain("BLOCKED");
    expect(markdown).toContain("No blocking check may be waived");
    expect(markdown).toContain("private operational state");
  });
});
