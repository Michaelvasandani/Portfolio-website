# Prove recovery and continued operation

Status: ready-for-agent
Blocked by: 04 (Establish owner access and the operational shell), 09 (Publish immutable candidates autonomously)

## Outcome

Objective production failure converges through one idempotent restore attempt, quarantine, circuit breaking, verified service continuity, observable outbox reconciliation, retention, and actionable notification.

## Included

- Implement objective failure classification and probe policy, prior-Valid routing restore, recovery verification, quarantine, breaker open/clear rules, retry/restore controls, and no-oscillation guarantees.
- Complete private operational views and controls with current served version, hashes, checks, source freshness, pending effects, deletion, retention, and notification state.
- Implement transactional outbox workers, ambiguous-response reconciliation, idempotent Resend policy, retention cleanup, audit compaction, backup monitoring, and missed-schedule handling.
- Complete and exercise all operational runbooks.

## Excluded

- Automatic rollback for subjective aesthetics, performance variation, field metrics, or transient third-party links; automatic unchanged re-promotion of a Quarantined deployment; or rebuild during restore.

## Acceptance checks

- Wrong hash or critical content triggers immediate recovery; availability/runtime/navigation/asset/accessibility smoke triggers only after three independent failures across two minutes.
- Exactly one idempotent attempt routes to the recorded preceding Valid deployment, verifies it, quarantines the failed deployment, opens the breaker, and sends one ledger-backed notification.
- Rollback ambiguity is reconciled by provider read; rollback or verification failure leaves the breaker open and escalates without oscillation.
- While open, the breaker permits source collection but blocks promotion; it clears only after the currently served Valid deployment passes recovery checks; Quarantined content cannot re-promote unchanged.
- Retention preserves the latest 20 restorable Valid deployments and required data, one year of compact audits, and 30 days of bulky rejected/Quarantined diagnostics; cleanup is idempotent.
- Every runbook exercise produces an operator-readable timeline and matches database, provider, public hash, outbox, and notification state.

## Acceptance evidence

Link controlled-failure timelines, provider and database state, routing and hash verification, breaker/quarantine records, duplicate-delivery tests, notification ledger and provider IDs, retention dry-run/application reports, backup status, and completed runbook exercise records.

## Failure and recovery

If restore or verification fails, production remains at the provider's observed state, the breaker stays open, further promotion stops, and Michael receives the rollback-failure escalation with precise manual recovery steps.

## Requirements

PUB-004, PUB-005, QAL-004, QAL-006, OPS-001, OPS-002
