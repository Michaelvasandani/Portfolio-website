# Ticket 10 — recovery and continued operation evidence

Status: local implementation complete; live acceptance open

## Reproducible local evidence

Run `pnpm verify:recovery`. The deterministic harness performs an immediate wrong-hash recovery with one deliberately ambiguous provider response, reconciles the provider read, routes once to the recorded preceding Valid deployment, validates fresh versioned/configuration-pinned QAL-006 evidence plus all three immutable identities, quarantines the failed deployment, opens the breaker, and records a rollback notification. The exact transaction-created notification and outbox record are then leased and delivered through an idempotent Resend port with an ambiguous accepted response. The harness also applies and reruns a dependency-safe latest-20/one-year/30-day retention plan, checks backup/PITR and schedule state, executes a retained-version manual restore with durable actor/reason/outcome/notification audit followed by verified breaker clearance, restores and reloads an isolated control-state snapshot, and evaluates both timelines using independently read provider routing/public-output state plus database/outbox/notification state.

[`ticket-10/local-recovery-run.json`](ticket-10/local-recovery-run.json) records the controlled failure classification, single route mutation, reconciliation read, served deployment, quarantine and breaker state, notification/provider IDs and delivery count, retention selection/application, continuity state, and completed local runbook exercise.

Focused automated tests additionally cover complete pinned checker evidence; three independent smoke failures spanning two minutes; duplicate recovery delivery; thrown and returned restore/check failures; no oscillation; open-breaker promotion blocking with source-collection allowance; manual restore and verified clearance; unchanged Quarantined candidate denial; notification allowlisting; cleanup dependency closure; stale backup, missed schedule and stuck-outbox monitoring; and mismatched runbook evidence failing closed.

## Production boundary

The Vercel routing/check, Neon transaction/backup, and Resend adapters fail closed until live managed resources are supplied. [`ticket-10/external-acceptance-blockers.json`](ticket-10/external-acceptance-blockers.json) lists the controlled production evidence still required. Local `memory://` reports and deterministic provider IDs are not represented as live evidence. OPS-002 therefore keeps ticket 10 open.
