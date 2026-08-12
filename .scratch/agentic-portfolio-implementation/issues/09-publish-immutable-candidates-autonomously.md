# Publish immutable candidates autonomously

Status: ready-for-agent
Blocked by: 02 (Provision the managed control plane), 07 (Compose evidence-bound candidates), 08 (Make publication checks executable)

## Outcome

PostgreSQL serializes restartable Publication runs that package, deploy, validate, promote, verify, and finalize the exact immutable candidate without bypass or rebuild.

## Included

- Implement run creation/coalescing, immutable input capture, leases, idempotency, compare-and-swap or locks, checkpoints, bounded retries, terminal states, and expired-lease sweeping.
- Store candidate packages privately, build pinned commits with candidate-scoped credentials, create zero-traffic deployments, invoke all candidate and preview checks, promote the exact checked deployment, and run Production checks.
- Require three complete Production-check passes across 90 seconds before Valid and Last-valid advancement.
- Finalize manifests, audits, deployment relationships, baseline data, and transactional outbox effects atomically where required.

## Excluded

- Recovery implementation, manual bypass, rolling releases, rebuilding during promotion, or authoritative beta queues.

## Acceptance checks

- Concurrent triggers serialize deterministically; superseded scheduled GitHub work coalesces; a new résumé upload never mutates an in-flight run.
- Every step can be retried after worker interruption without duplicate candidate, deployment, promotion, audit, or notification effects.
- Builds can retrieve exactly one candidate with a short-lived credential; public output matches manifest and contains only Public projection.
- A failed pre-promotion step rejects the candidate, preserves Source snapshots and Last valid portfolio, and resumes unfinished outbox work.
- Only the exact zero-traffic deployment that passed all checks can promote; three passes advance Last valid once, while any gated failure prevents advancement.
- Sweeper tests recover expired leases, detect missed schedules, reconcile ambiguous provider responses by reading state, and terminalize after bounded retries.

## Acceptance evidence

Link state-transition histories, concurrency and crash-injection results, idempotency ledger, package/build hashes, deployment IDs, preview and production reports, Last-valid transaction proof, sweeper results, and public-projection scan.

## Failure and recovery

All pre-promotion failures preserve the Last valid portfolio. A detected objective post-promotion failure enters the recovery workflow owned by “Prove recovery and continued operation.”

## Requirements

PUB-001, PUB-002, PUB-003, PUB-004, PUB-005, QAL-001, QAL-006, OPS-002
