# Recovery and continued-operation guide

The recovery worker accepts only objective production evidence. Wrong deployment/manifest hashes and confirmed critical-content mismatch qualify immediately. Availability, asset, runtime, navigation, and accessibility smoke require three distinct probe identities with ordered observations spanning at least two minutes. Performance variation, field metrics, subjective aesthetics, and transient external-link availability never enter automatic recovery.

## Automated recovery

1. Persist the objective evidence, open the breaker, and create the rollback outbox intent in one authoritative transaction.
2. Select only the failed deployment's recorded preceding Valid deployment. Use `rollback:<incident-id>` as the provider idempotency key and never rebuild.
3. If the route response is ambiguous, read provider routing before deciding whether another action is safe. There is no second automatic restore attempt.
4. Verify provider deployment, candidate, manifest, and public-output identities plus fresh blocking recovery checks. Every check record must include checker identity/version, rules hash, configuration hash, execution image and clean-environment identity, target, start/finish timestamps, measurements, retry history, outcome, and report pointer. At most two retries may run, each in a distinct clean environment; stale or unpinned evidence fails closed.
5. Quarantine the failed deployment, retain the provider-observed served state, leave the breaker open, and create exactly one actionable notification-ledger entry.
6. If routing or verification fails, send rollback-failure escalation with the manual steps in the ledger. Do not oscillate between deployments.

Promotion calls the recovery promotion gate immediately before any provider mutation. An open breaker blocks promotion but not source collection. A candidate hash previously marked Quarantined cannot promote unchanged. Clearance requires a provider routing read followed by fresh identity-bound recovery checks against the currently served retained Valid deployment.

## Operator controls and state

Authenticated server-rendered control views expose publication runs, deployments, current served deployment and hashes, check evidence, source freshness, raw deletion, rollback/notification outbox state, the notification ledger/provider ID, retention reports, backup/PITR state, and the recovery timeline. Operational identifiers and hashes are visible only after owner authentication; credentials, tokens, private endpoints, database URLs, and evidence graphs remain redacted. Production runtime injection must provide persistent owner storage and the recorded operational repository; missing resources produce an explicit unavailable state.

Install production auth storage, recorded operational reads, and command controls together through `installOwnerAccessRuntimeResources`; this is the application composition seam. Until those live resources are supplied, the runtime and provider adapters remain explicitly unavailable and cannot claim operational success.

An exceptional manual restore must keep the breaker open, select a retained Valid deployment, use a new idempotent route request, reconcile provider state on ambiguity, verify the public hashes and recovery checks, record actor/reason/outcome privately, and follow normal breaker clearance. A checker may be repaired and the same immutable candidate retried; no blocking result may be waived.

## Retention, monitoring, and backup

Always inspect a dry run before applying cleanup. Preserve the latest 20 Valid deployments and every transitive Career snapshot, manifest, check outcome, and reproducibility dependency. Preserve compact audits for one year and rejected/Quarantined bulky diagnostics for 30 days. Cleanup originates in an idempotent outbox intent and reads provider state after an ambiguous response.

The continuity monitor checks daily GitHub collection age, oldest pending effect age, backup verification age, and explicit Neon point-in-time recovery configuration. Missing or stale evidence is action-required, never healthy by assumption. During database recovery, restore to an isolated database, validate authoritative state, and reconcile Vercel, Blob, and Resend before cutover; database recovery is not provider truth and does not replace retained deployments.

## Exercise and verification

Run `pnpm verify:recovery`. A completed exercise must contain a chronological operator timeline and match database served deployment/hash, independently read provider routing and public output hash, outbox convergence, notification ledger/provider message ID, and backup/PITR state. The database exercise must export, restore, and reload an isolated control-state snapshot before reconciliation. Any discrepancy fails the exercise. Live qualification additionally requires the provider evidence enumerated in `evidence/ticket-10/external-acceptance-blockers.json`.
