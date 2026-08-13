import { PRODUCTION_QUALIFICATION_ITEMS, type ProductionQualificationReport } from "./service";

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderOperatorHandoff(report: ProductionQualificationReport): string {
  const incompleteByItem = new Map(
    report.incompleteEvidence.map((finding) => [finding.itemId, finding.reasons]),
  );
  const evidenceByItem = new Map(report.evidence.map((record) => [record.itemId, record]));
  const rows = PRODUCTION_QUALIFICATION_ITEMS.map((item) => {
    const record = evidenceByItem.get(item.id);
    const reasons = incompleteByItem.get(item.id) ?? [];
    const state = reasons.length === 0 ? "PASS" : "BLOCKED";
    const pointers = record?.artifactPointers.join("<br>") || "—";
    const detail = reasons.join("; ") || "verified";
    return `| ${item.id} | ${item.owner} | ${state} | ${escapeCell(detail)} | ${escapeCell(pointers)} |`;
  });

  return `# Production qualification and operating handoff

Generated: ${report.generatedAt}

Qualification outcome: ${report.outcome.toUpperCase()}

This package is an index, not a substitute for private provider evidence. No blocking check may be waived, and no local fixture may be represented as a production observation.

## Qualification inventory

| Exercise | Owner | State | Evidence gap or result | Artifact pointer |
| --- | --- | --- | --- | --- |
${rows.join("\n")}

## Prior-ticket boundary

Incomplete prior tickets: ${report.incompletePriorTickets.length > 0 ? report.incompletePriorTickets.join(", ") : "none"}.

## Michael's private operational state walkthrough

- Locate the private run, deployment, check, served-version, breaker, outbox, deletion, and notification views.
- Demonstrate retry of correctable work and manual restore of a retained Valid deployment.
- Confirm the private evidence package holds provider run/deployment IDs, hashes, reports, redacted records, and signatures without secret values.
- Sign only after every row above is PASS and the bidirectional audit has no finding.

## Safety boundary

Production qualification must use the ordinary publication and recovery paths. Do not use an exceptional release bypass, rebuild during rollback, waive a blocking result, publish a phone number, ingest LinkedIn, or perform destructive decommissioning without an explicit separately reviewed plan naming exact provider resources.
`;
}
