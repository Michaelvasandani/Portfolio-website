# Ticket 09 — autonomous immutable-publication evidence

Status: deterministic local orchestration complete; ticket remains open pending live provider acceptance from tickets 02, 07, and 08.

## Reproduce

```sh
pnpm verify:publication-orchestration
pnpm exec vitest run src/publication
pnpm typecheck
```

The PostgreSQL transactional/CAS store port and deterministic in-memory conformance harness cover immutable trigger capture, deterministic serialization, scheduled-input coalescing, résumé-input isolation, leases, typed compare-and-swap checkpoints, bounded retries, terminal states, expired-lease sweeping, missed schedules, transactional outbox effects, and ambiguous provider-response reconciliation.

The positive harness validates the canonical strict Public-projection schema, packages one hashed candidate, gives the pinned-commit build one expiring single-package/single-retrieval credential, runs ticket 08's pinned full preview checker inventory against a unique zero-traffic deployment, promotes that exact provider deployment without rebuilding, and records three fresh identity-bound Production-check passes at 0, 45, and 90 seconds through the injected clock. Each pass retains pinned checker identity/rules/configuration, target, timings, measurements, clean-attempt history, and report pointers. Finalization atomically installs the complete candidate/preview/production manifest, deployment/recovery relationship and quality baseline, advances Last valid, records its audit, and creates the retention outbox intent. The Public projection scan is empty.

The harness's `memory://` Production report pointers deliberately identify deterministic local observations only. Durable provider report/artifact pointers remain part of the ticket 08/live-resource blocker and are not claimed here.

[`ticket-09/local-orchestration-run.json`](ticket-09/local-orchestration-run.json) records the state-transition history, concurrency result, idempotency ledger, package/build hashes, deployment IDs, Production passes, final transaction proof, ambiguity reconciliation counts, sweeper result, and Public projection scan. [`ticket-09/external-acceptance-blockers.json`](ticket-09/external-acceptance-blockers.json) records why live acceptance cannot yet be claimed.

## Failure boundary

Focused tests prove that a blocking pre-promotion result rejects the candidate, preserves the prior Last-valid deployment and immutable run inputs, and leaves the terminal-failure notification pending for outbox delivery. Response-loss injections after preview creation, promotion, and operational effect application are reconciled by reading provider state before any retry, producing one effect of each kind. Production factories and adapters fail closed until live ticket 02 control-plane resources, a ticket 07 provider-backed candidate, and ticket 08 provider-backed preview/Production checks are supplied.

No Vercel/Blob/Neon deployment identity or live production observation is available in this workspace. No blocking checker is waived, no local result is represented as live-provider evidence, and OPS-002 therefore keeps the ticket open.
