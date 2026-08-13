# Ticket 11 — production qualification and handoff evidence

Date: 2026-08-12

Ticket status: **open — repository audit and fail-closed handoff tooling complete; production exercises and Michael's sign-off pending**

No managed service was provisioned, no real Career or GitHub source was ingested, no model request or Vercel deployment was made, no production traffic was changed, no email was sent, no credential was created or rotated, and no provider resource was deleted in this implementation session. Ticket 11 and every live-blocked predecessor remain incomplete under OPS-002 and OPS-003.

## Reproducible repository evidence

```text
bash .scratch/agentic-portfolio-implementation/audit-handoff.sh
passed: 34 specification requirements; zero orphan requirements; zero unsupported ticket requirements; eleven dependency-valid tickets; all decision links and required runbooks present

pnpm exec vitest run src/qualification
passed: 3 files; 11 qualification, handoff, repository parsing, closure-evidence resolution, digest/signature, package-integrity, persistence, and fail-closed exit tests

pnpm verify:production-qualification -- --generated-at 2026-08-12T20:00:00.000Z
expected exit 1: repository audit clean; prior tickets and 20 production/human-owned evidence items incomplete

pnpm verify
passed: lint; typecheck; schema; 485 unit/integration tests; migration rollback check; production build; 51 browser tests across Chromium, Firefox, and WebKit
```

The checked-in [`production-evidence.json`](ticket-11/production-evidence.json) is a value-free ledger whose pending records name the exact live exercises still required. [`qualification-report.json`](ticket-11/qualification-report.json) is the machine-readable bidirectional audit and acceptance result. [`operator-handoff.md`](ticket-11/operator-handoff.md) is the owner/action/evidence-location checklist. The verifier rejects local scope, unresolved or digest-mismatched artifacts, placeholder or waiver pointers, missing claims/timestamps, invalid ticket states/dependencies, empty or incomplete predecessor closure evidence, unsupported or orphan requirement IDs, missing package artifacts/links/runbook checklists, and owner actions without a valid Ed25519 Michael attestation over the evidence ledger.

## External qualification boundary

- Close tickets 02 and 04–10 with their linked live managed-environment evidence; ticket 03 is the only completed human Approved-renderer baseline among those dependencies.
- Ingest Michael's real sanitized Career snapshot and current GitHub evidence; retain deletion, freshness, schedule, manual dispatch, and no-op records.
- Bind a real provider-generated candidate to a private manifest/public hash and pass candidate plus unique zero-traffic preview gates.
- Promote that exact deployment without rebuild, record three complete Production-check passes across 90 seconds, and finalize it exactly once as Last valid.
- Exercise controlled pre-promotion preservation and post-promotion production restoration, including provider reads, one route change, fresh verification, quarantine, breaker, and one alert.
- Exercise deletion, outbox ambiguity, retry, retention, live notification reconciliation, isolated backup/PITR restore, credential rotation, manual restore, breaker clearance, incident response, and a non-destructive decommissioning walkthrough.
- Walk Michael through the private operational state and evidence location, then record his signature only after every check passes.

No exceptional release, waiver, locally fabricated provider pointer, phone-number publication, LinkedIn ingestion, or destructive production effect is permitted. Any failed item preserves or restores Last valid and leaves this ticket open.
