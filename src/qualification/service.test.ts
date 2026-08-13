import { describe, expect, it } from "vitest";

import {
  PRODUCTION_QUALIFICATION_ITEMS,
  qualifyProduction,
  type ProductionQualificationInput,
} from "./service";

const requirementIds = ["PRD-001", "OPS-003", "HOF-002"];

function completeInput(): ProductionQualificationInput {
  return {
    generatedAt: "2026-08-12T20:00:00.000Z",
    requirementIds,
    tracedRequirementIds: requirementIds,
    tickets: [
      {
        id: "01",
        status: "complete",
        blockers: [],
        requirementIds: ["PRD-001", "HOF-002"],
        evidencePointers: ["private://ticket-01"],
        evidenceVerified: true,
      },
      {
        id: "02",
        status: "complete",
        blockers: ["01"],
        requirementIds: ["OPS-003"],
        evidencePointers: ["private://ticket-02"],
        evidenceVerified: true,
      },
    ],
    evidence: PRODUCTION_QUALIFICATION_ITEMS.map((item) => ({
      itemId: item.id,
      outcome: "passed" as const,
      scope: item.requiredScope,
      artifactPointers: [`private://qualification/${item.id}`],
      claims: item.requiredClaims,
      verifiedAt: "2026-08-12T19:59:00.000Z",
      ...(item.owner === "Michael" ? { signedBy: "Michael Sagar Vasandani" } : {}),
    })),
    verifiedArtifactPointers: PRODUCTION_QUALIFICATION_ITEMS.map(
      (item) => `private://qualification/${item.id}`,
    ),
    ownerAttestationVerified: true,
    packageAudit: {
      missingPackageArtifacts: [],
      brokenPackageLinks: [],
      missingRunbookChecklists: [],
    },
  };
}

describe("qualifyProduction", () => {
  it("qualifies a complete, production-scoped package with bidirectional traceability", () => {
    const report = qualifyProduction(completeInput());

    expect(report.outcome).toBe("qualified");
    expect(report.audit).toEqual({
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
    });
    expect(report.incompletePriorTickets).toEqual([]);
    expect(report.incompleteEvidence).toEqual([]);
  });

  it("fails closed for open predecessors, unsupported requirements, missing claims, local evidence, and placeholder pointers", () => {
    const input = completeInput();
    input.tickets[1] = {
      ...input.tickets[1]!,
      status: "ready-for-human",
      requirementIds: ["OPS-003", "NOPE-999"],
    };
    input.evidence = input.evidence.map((record) =>
      record.itemId === "ordinary-publication"
        ? {
            ...record,
            scope: "local",
            artifactPointers: ["TODO-production-run"],
            claims: ["private-manifest"],
          }
        : record,
    );

    const report = qualifyProduction(input);

    expect(report.outcome).toBe("incomplete");
    expect(report.audit.unsupportedTicketRequirements).toEqual(["NOPE-999"]);
    expect(report.incompletePriorTickets).toEqual(["02"]);
    expect(report.incompleteEvidence).toContainEqual(
      expect.objectContaining({
        itemId: "ordinary-publication",
        reasons: expect.arrayContaining([
          "requires production evidence",
          "contains a placeholder or waiver pointer",
          "missing claim: public-manifest-hash",
          "missing claim: finalized-exactly-once",
        ]),
      }),
    );
  });

  it("rejects a human-owned exercise without Michael's signature", () => {
    const input = completeInput();
    input.evidence = input.evidence.map((record) =>
      record.itemId === "signed-handoff" ? { ...record, signedBy: undefined } : record,
    );

    const report = qualifyProduction(input);

    expect(report.outcome).toBe("incomplete");
    expect(report.incompleteEvidence).toContainEqual({
      itemId: "signed-handoff",
      reasons: ["Michael signature required"],
    });
  });

  it("rejects unverified artifacts, predecessor evidence, and an unauthenticated owner attestation", () => {
    const input = completeInput();
    input.verifiedArtifactPointers = input.verifiedArtifactPointers.filter(
      (pointer) => !pointer.endsWith("ordinary-publication"),
    );
    input.ownerAttestationVerified = false;
    input.tickets[0] = { ...input.tickets[0]!, evidenceVerified: false };

    const report = qualifyProduction(input);

    expect(report.outcome).toBe("incomplete");
    expect(report.audit.missingTicketEvidence).toEqual(["01"]);
    expect(report.incompleteEvidence).toContainEqual({
      itemId: "ordinary-publication",
      reasons: ["artifact pointer was not resolved and hash-verified"],
    });
    expect(report.incompleteEvidence).toContainEqual(
      expect.objectContaining({
        itemId: "signed-handoff",
        reasons: expect.arrayContaining(["Michael attestation signature is not verified"]),
      }),
    );
  });

  it("fails closed for unknown and duplicate evidence records", () => {
    const input = completeInput();
    input.evidence = [
      ...input.evidence,
      input.evidence[0]!,
      {
        itemId: "unsupported-exercise",
        outcome: "passed",
        scope: "production",
        artifactPointers: ["private://unsupported"],
        claims: [],
        verifiedAt: "2026-08-12T19:59:00.000Z",
      },
    ];

    const report = qualifyProduction(input);

    expect(report.outcome).toBe("incomplete");
    expect(report.audit.duplicateEvidenceItems).toEqual(["provisioning-verification"]);
    expect(report.audit.unknownEvidenceItems).toEqual(["unsupported-exercise"]);
  });
});
