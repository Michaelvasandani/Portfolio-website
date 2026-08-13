export type TicketStatus = "ready-for-agent" | "ready-for-human" | "complete";
export type EvidenceOutcome = "passed" | "pending" | "failed";
export type EvidenceScope = "repository" | "production" | "local";

export interface QualificationItem {
  id: string;
  label: string;
  owner: "automation" | "Michael";
  requiredScope: Exclude<EvidenceScope, "local">;
  requiredClaims: readonly string[];
}

export const PRODUCTION_QUALIFICATION_ITEMS = [
  {
    id: "provisioning-verification",
    label: "Provisioning verification and signed provider inventory",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["three-environment-separation", "least-privilege-probes", "owner-sign-off"],
  },
  {
    id: "real-source-ingestion",
    label: "Real Career snapshot and fresh immutable GitHub evidence",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: ["career-snapshot", "raw-deletion-intent", "fresh-github-snapshot"],
  },
  {
    id: "approved-renderer-and-quality-baseline",
    label: "Approved renderer and production Quality baseline",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["renderer-approval", "manual-accessibility-baseline", "quality-baseline"],
  },
  {
    id: "ordinary-publication",
    label: "Ordinary immutable production publication",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: [
      "private-manifest",
      "public-manifest-hash",
      "deployment-and-run-ids",
      "complete-quality-report",
      "candidate-gates-passed",
      "preview-gates-passed",
      "three-production-passes-across-90-seconds",
      "finalized-exactly-once",
    ],
  },
  {
    id: "daily-github-synchronization",
    label: "Daily GitHub synchronization",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: ["scheduled-run", "freshness-visible", "no-op-visible"],
  },
  {
    id: "manual-github-synchronization",
    label: "Manual GitHub reconciliation",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["workflow-dispatch", "signed-delivery", "snapshot-installed-or-no-op"],
  },
  {
    id: "pre-promotion-rejection",
    label: "Controlled pre-promotion rejection",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: ["blocking-failure", "last-valid-unchanged", "diagnostics-retained"],
  },
  {
    id: "post-promotion-recovery",
    label: "Controlled post-promotion objective failure and restoration",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: [
      "objective-trigger",
      "single-route-change",
      "prior-valid-verified",
      "failed-deployment-quarantined",
      "breaker-opened",
      "alert-sent",
    ],
  },
  {
    id: "raw-deletion",
    label: "Raw upload deletion and bounded reconciliation",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: ["transactional-intent", "provider-state-reconciled", "raw-bytes-absent"],
  },
  {
    id: "outbox-and-retry",
    label: "Outbox ambiguity and retry exercise",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: ["provider-read-before-retry", "idempotent-effect", "ledger-converged"],
  },
  {
    id: "retention",
    label: "Retention dry-run, application, and idempotent rerun",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: ["latest-20-valid-preserved", "dependencies-preserved", "idempotent-rerun"],
  },
  {
    id: "backup-and-pitr",
    label: "Backup and isolated point-in-time recovery exercise",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["pitr-configured", "isolated-restore", "external-state-reconciled"],
  },
  {
    id: "notification",
    label: "Notification ledger and provider reconciliation",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: ["allowlisted-trigger", "single-provider-message", "ledger-provider-match"],
  },
  {
    id: "manual-restore-and-breaker",
    label: "Manual restore and circuit-breaker clearance",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["retained-valid-selected", "restore-verified", "breaker-cleared-after-checks"],
  },
  {
    id: "credential-rotation",
    label: "Credential rotation exercise",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["replacement-proved", "old-credential-denied", "scans-clean"],
  },
  {
    id: "incident-exercise",
    label: "Incident-response exercise",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["timeline", "containment", "recovery", "follow-up"],
  },
  {
    id: "decommissioning-exercise",
    label: "Non-destructive decommissioning exercise",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["dry-run-only", "exact-resource-inventory", "final-public-state-decision"],
  },
  {
    id: "operational-state-walkthrough",
    label: "Private operational-state walkthrough",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["state-located", "retry-demonstrated", "restore-demonstrated"],
  },
  {
    id: "operational-audit-trail",
    label: "Immutable operational audit-trail exercise",
    owner: "automation",
    requiredScope: "production",
    requiredClaims: [
      "run-transitions-retained",
      "finalization-audit-immutable",
      "recovery-audit-immutable",
      "one-year-retention-proved",
    ],
  },
  {
    id: "traceability-audit",
    label: "Bidirectional requirement and ticket audit",
    owner: "automation",
    requiredScope: "repository",
    requiredClaims: ["zero-orphans", "zero-unsupported-tickets", "zero-missing-dependencies"],
  },
  {
    id: "signed-handoff",
    label: "Signed operating-package handoff",
    owner: "Michael",
    requiredScope: "production",
    requiredClaims: ["runbook-checklist", "private-evidence-location", "owner-acceptance"],
  },
] as const satisfies readonly QualificationItem[];

export interface QualificationTicket {
  id: string;
  status: string;
  blockers: string[];
  requirementIds: string[];
  evidencePointers: string[];
  evidenceVerified: boolean;
}

export interface ProductionEvidenceRecord {
  itemId: string;
  outcome: EvidenceOutcome;
  scope: EvidenceScope;
  artifactPointers: string[];
  claims: readonly string[];
  verifiedAt?: string;
  signedBy?: string;
  notes?: string;
}

export interface ProductionQualificationInput {
  generatedAt: string;
  requirementIds: string[];
  tracedRequirementIds: string[];
  tickets: QualificationTicket[];
  evidence: ProductionEvidenceRecord[];
  verifiedArtifactPointers: string[];
  ownerAttestationVerified: boolean;
  packageAudit: PackageAudit;
}

export interface PackageAudit {
  missingPackageArtifacts: string[];
  brokenPackageLinks: string[];
  missingRunbookChecklists: string[];
}

export interface TraceabilityAudit {
  orphanRequirements: string[];
  unsupportedTraceabilityRequirements: string[];
  unsupportedTicketRequirements: string[];
  missingDependencies: string[];
  invalidTicketStatuses: string[];
  requirementsWithoutTickets: string[];
  missingTicketEvidence: string[];
  unknownEvidenceItems: string[];
  duplicateEvidenceItems: string[];
  missingPackageArtifacts: string[];
  brokenPackageLinks: string[];
  missingRunbookChecklists: string[];
}

export interface IncompleteEvidence {
  itemId: string;
  reasons: string[];
}

export interface ProductionQualificationReport {
  schemaVersion: 1;
  generatedAt: string;
  outcome: "qualified" | "incomplete";
  audit: TraceabilityAudit;
  incompletePriorTickets: string[];
  incompleteEvidence: IncompleteEvidence[];
  evidence: ProductionEvidenceRecord[];
}

const allowedStatuses = new Set<TicketStatus>(["ready-for-agent", "ready-for-human", "complete"]);
const nonEvidencePointer = /(?:placeholder|pending|todo|waiv|memory:\/\/|local:\/\/)/i;

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function buildAudit(input: ProductionQualificationInput): TraceabilityAudit {
  const requirements = new Set(input.requirementIds);
  const traced = new Set(input.tracedRequirementIds);
  const ticketIds = new Set(input.tickets.map((ticket) => ticket.id));
  const ticketRequirements = input.tickets.flatMap((ticket) => ticket.requirementIds);
  const qualificationItemIds = new Set<string>(PRODUCTION_QUALIFICATION_ITEMS.map((item) => item.id));
  const evidenceCounts = new Map<string, number>();
  for (const record of input.evidence) {
    evidenceCounts.set(record.itemId, (evidenceCounts.get(record.itemId) ?? 0) + 1);
  }

  return {
    orphanRequirements: sorted(input.requirementIds.filter((id) => !traced.has(id))),
    unsupportedTraceabilityRequirements: sorted(
      input.tracedRequirementIds.filter((id) => !requirements.has(id)),
    ),
    unsupportedTicketRequirements: sorted(ticketRequirements.filter((id) => !requirements.has(id))),
    missingDependencies: sorted(
      input.tickets.flatMap((ticket) =>
        ticket.blockers
          .filter((blocker) => !ticketIds.has(blocker) || Number(blocker) >= Number(ticket.id))
          .map((blocker) => `${ticket.id}->${blocker}`),
      ),
    ),
    invalidTicketStatuses: sorted(
      input.tickets
        .filter((ticket) => !allowedStatuses.has(ticket.status as TicketStatus))
        .map((ticket) => `${ticket.id}:${ticket.status}`),
    ),
    requirementsWithoutTickets: sorted(
      input.requirementIds.filter((id) => !ticketRequirements.includes(id)),
    ),
    missingTicketEvidence: sorted(
      input.tickets
        .filter((ticket) => ticket.status === "complete" && !ticket.evidenceVerified)
        .map((ticket) => ticket.id),
    ),
    unknownEvidenceItems: sorted(
      input.evidence
        .filter((record) => !qualificationItemIds.has(record.itemId))
        .map((record) => record.itemId),
    ),
    duplicateEvidenceItems: sorted(
      [...evidenceCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([itemId]) => itemId),
    ),
    missingPackageArtifacts: sorted(input.packageAudit.missingPackageArtifacts),
    brokenPackageLinks: sorted(input.packageAudit.brokenPackageLinks),
    missingRunbookChecklists: sorted(input.packageAudit.missingRunbookChecklists),
  };
}

function evidenceReasons(
  item: QualificationItem,
  record: ProductionEvidenceRecord | undefined,
  input: ProductionQualificationInput,
): string[] {
  if (!record) return ["evidence record missing"];
  const reasons: string[] = [];
  if (record.outcome !== "passed") reasons.push(`evidence outcome is ${record.outcome}`);
  if (record.scope !== item.requiredScope) reasons.push(`requires ${item.requiredScope} evidence`);
  if (record.artifactPointers.length === 0) reasons.push("artifact pointer missing");
  if (record.artifactPointers.some((pointer) => nonEvidencePointer.test(pointer))) {
    reasons.push("contains a placeholder or waiver pointer");
  }
  if (
    record.artifactPointers.length > 0 &&
    record.artifactPointers.some((pointer) => !input.verifiedArtifactPointers.includes(pointer))
  ) {
    reasons.push("artifact pointer was not resolved and hash-verified");
  }
  for (const claim of item.requiredClaims) {
    if (!record.claims.includes(claim)) reasons.push(`missing claim: ${claim}`);
  }
  if (record.outcome === "passed" && !record.verifiedAt) reasons.push("verification time missing");
  if (item.owner === "Michael" && record.signedBy !== "Michael Sagar Vasandani") {
    reasons.push("Michael signature required");
  }
  if (item.owner === "Michael" && !input.ownerAttestationVerified) {
    reasons.push("Michael attestation signature is not verified");
  }
  return reasons;
}

export function qualifyProduction(input: ProductionQualificationInput): ProductionQualificationReport {
  const audit = buildAudit(input);
  const incompletePriorTickets = sorted(
    input.tickets.filter((ticket) => ticket.id !== "11" && ticket.status !== "complete").map((ticket) => ticket.id),
  );
  const recordsByItem = new Map(input.evidence.map((record) => [record.itemId, record]));
  const incompleteEvidence = PRODUCTION_QUALIFICATION_ITEMS.flatMap((item) => {
    const reasons = evidenceReasons(item, recordsByItem.get(item.id), input);
    return reasons.length > 0 ? [{ itemId: item.id, reasons }] : [];
  });
  const auditHasFindings = Object.values(audit).some((findings) => findings.length > 0);

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    outcome:
      auditHasFindings || incompletePriorTickets.length > 0 || incompleteEvidence.length > 0
        ? "incomplete"
        : "qualified",
    audit,
    incompletePriorTickets,
    incompleteEvidence,
    evidence: input.evidence,
  };
}
