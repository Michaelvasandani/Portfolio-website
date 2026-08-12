# Agentic Portfolio — Operational Runbooks

Status: normative checklists
Version: 1.0.0

Never paste credential values into this repository, tickets, screenshots, logs, or audit evidence. Record only secret-store name, credential identity, scope, owner, created/rotated date, and provider resource identifier.

## Provisioning

Human owner: Michael

- [ ] Create or confirm a Vercel Pro team and separate development, preview, and production projects/environments.
- [ ] Connect Neon PostgreSQL through Vercel Marketplace; enable pooled runtime connections, a separate migration identity, backups, and point-in-time recovery.
- [ ] Create private Vercel Blob stores with environment separation and confirm anonymous reads/listing fail.
- [ ] Confirm Vercel Sandbox availability and the ability to run a pinned network-disabled parser image with resource limits.
- [ ] Create a GitHub App with only the identity permissions needed for login; record Michael's immutable numeric GitHub user ID in the secret store.
- [ ] Register exact OAuth callbacks per environment and reject wildcard callbacks.
- [ ] Configure the GitHub Actions ingestion secret; grant the workflow no database, Blob, model, Resend, or deployment credential.
- [ ] Select a model provider/model that supports the GEN-001 structured evidence contract and approved privacy/retention settings; record provider/model/version in run manifests.
- [ ] Verify a Resend sending domain and create an environment-scoped send credential restricted to the actionable-notification path.
- [ ] Create environment-scoped Vercel control credentials with only required deployment/read/promote operations.
- [ ] Run successful and denied connection probes for every identity, then revoke temporary probe credentials.
- [ ] Run repository, deployment, and public-bundle secret scans.
- [ ] Attach redacted configuration evidence and sign off [Provision the managed control plane](../issues/02-provision-the-managed-control-plane.md).

Stop if environment boundaries are unclear, any service is public by default, a credential is shared across unrelated roles, denied probes succeed, or evidence would expose a secret.

## Credential rotation

- [ ] Identify credential, environments, holder, dependent components, provider revocation behavior, and incident status.
- [ ] Create a replacement with equal or narrower scope in the approved secret store.
- [ ] Deploy consumers without printing the value; prove successful use and expected denial outside scope.
- [ ] Revoke the old credential and verify it fails.
- [ ] Invalidate sessions when OAuth/session material changed; reconcile in-flight outbox/provider operations before rotating Vercel or Blob control credentials.
- [ ] Update credential metadata and rotation date, not the value; run secret and public-bundle scans.
- [ ] If compromise is suspected, follow **Incident response** and inspect every provider/audit event within the exposure window.

## Normal publication

- [ ] Confirm Publication circuit breaker is closed and required services/checkers report healthy.
- [ ] Capture exact valid Career and fresh GitHub snapshot IDs, Presentation-policy version, code and Approved-renderer commits, component versions, and prior selection state.
- [ ] Confirm the run is serialized and its immutable inputs cannot change.
- [ ] Observe reconcile, select, generate, render, validate, deploy-preview, and validate-preview checkpoints.
- [ ] Confirm every blocking check passed and all warnings are classified and retained.
- [ ] Confirm candidate, package, manifest, preview, and public-output hashes form one chain.
- [ ] Promote the exact checked deployment without rebuild.
- [ ] Require three complete Production-check passes across 90 seconds.
- [ ] Confirm a single transaction marks the deployment Valid, advances Last valid, finalizes audit, and creates required outbox intents.
- [ ] Confirm no routine-success email was sent.

Stop before promotion on any stale input, missing or contradictory check, hash mismatch, unknown warning class, or open breaker.

## Monitoring

- [ ] Daily: verify GitHub schedule completion, snapshot age, raw-deletion queue age, expired leases, outbox age, breaker state, and terminal failures.
- [ ] Weekly: verify backup/PITR status, notification reconciliation, retained Valid count, production public hash, and critical link status.
- [ ] Monthly: review credential age/scope, dependency and checker pin drift, audit storage, rejected/Quarantined diagnostics, and field Core Web Vitals as warnings.
- [ ] After source update: confirm no-op or finalized run, source versions, public timestamp/hash, and Last-valid relationship.
- [ ] Never treat missing field metrics or transient third-party unavailability as production failure.

## Incident response

- [ ] Record incident start, reporter, observed public deployment/hash, Last-valid deployment/hash, breaker state, affected credential/source/run, and provider state.
- [ ] If confidentiality or authorization may be compromised, open the breaker, revoke/rotate affected credentials, invalidate sessions, and preserve redacted audit evidence.
- [ ] If public integrity or objective production behavior failed, follow **Rollback and verification**.
- [ ] If a raw upload is stuck, verify the database deletion intent and Blob state, reconcile idempotently, and escalate after the bounded window.
- [ ] If an outbox effect is ambiguous, read provider state before retry.
- [ ] If a checker is broken, repair it and rerun the same immutable candidate; never waive the result.
- [ ] Document timeline, scope, containment, recovery, evidence links, and follow-up requirement/spec changes.

## Rollback and verification

- [ ] Confirm the trigger is objective: wrong hash/critical content, or three independent availability, asset, runtime, navigation, or accessibility-smoke failures across two minutes.
- [ ] Record current routing and the exact preceding Valid deployment from PostgreSQL.
- [ ] Open or confirm the breaker and acquire the idempotent recovery operation.
- [ ] Issue one route change to the recorded deployment; on timeout, query Vercel state before any retry.
- [ ] Verify public manifest/hash and all required recovery Production checks.
- [ ] Quarantine the rejected deployment; never rebuild or automatically re-promote it unchanged.
- [ ] Record recovery outcome and reconcile the single Resend notification against PostgreSQL.
- [ ] If routing or verification fails, keep the breaker open and follow **Manual restore**; do not oscillate among deployments.

## Circuit-breaker clearance

- [ ] Confirm source collection continued safely and no promotion occurred while open.
- [ ] Identify the currently served deployment from provider state; do not assume database routing state.
- [ ] Confirm it is a retained Valid deployment and not Quarantined.
- [ ] Run its hash check and complete recovery Production checks.
- [ ] Reconcile pending outbox, deletion, and notification work.
- [ ] Clear the breaker transactionally only after all checks pass.
- [ ] Start new promotion as a new or properly resumed run; never re-promote Quarantined content unchanged.

## Manual restore

Human owner: Michael

- [ ] Open the breaker before changing production routing.
- [ ] Select one of the latest 20 retained Valid deployments from the private interface; inspect its manifest, Career snapshot relationship, age, and prior check outcome.
- [ ] Confirm it is not Quarantined and its immutable artifact still exists.
- [ ] Request one idempotent route change; reconcile provider state on ambiguity.
- [ ] Verify public hash and recovery Production checks.
- [ ] Record the manual reason, actor, selected version, outcome, and notification state.
- [ ] Follow **Circuit-breaker clearance**; do not silently redefine Last valid or delete the displaced deployment.

## Retention

- [ ] Produce a dry-run list grouped by Valid, Quarantined, rejected, Source snapshot, compact audit, and bulky diagnostic.
- [ ] Preserve the latest 20 Valid deployments plus required Career snapshots, manifests, hashes, check outcomes, and reproducibility material.
- [ ] Preserve compact run/audit records for one year and bulky rejected/Quarantined reports for 30 days.
- [ ] Confirm no retained Valid deployment depends on an item selected for deletion.
- [ ] Enqueue cleanup through the outbox; reconcile provider state and record hashes/counts.
- [ ] Rerun the same cleanup plan to prove idempotency.
- [ ] Verify PITR remains configured; never use PITR as a substitute for retained deployments.

## Backup and database recovery

- [ ] Record incident time and freeze promotion by opening the breaker.
- [ ] Select the PITR target and restore to an isolated database first.
- [ ] Validate schema, immutable Source snapshots, run state, Last-valid pointer, breaker, outbox, and notification ledger.
- [ ] Query Vercel, Blob, and Resend for actual external state and reconcile differences; database state alone is not provider truth.
- [ ] Cut over database access through the approved credential process.
- [ ] Verify currently served deployment hash and recovery checks before clearing the breaker.

## Decommissioning

- [ ] Open the breaker and stop schedules, upload-token issuance, new runs, promotions, and notifications while leaving the current Valid deployment served unless the approved plan says otherwise.
- [ ] Export the required audit, manifests, source provenance, and restoration metadata to the approved private archive.
- [ ] Delete raw or transient objects first and verify outbox convergence.
- [ ] Revoke OAuth, Actions-ingestion, model, Resend, Blob, database, and Vercel credentials and prove denial.
- [ ] Remove private control routes and provider resources only after target/resource IDs and retention obligations are reviewed by Michael.
- [ ] Verify whether the public Portfolio remains as a static retained deployment or is intentionally removed; record the decision and final public state.
- [ ] Run a final secret, DNS, callback, schedule, and provider-resource inventory.

Destructive resource deletion requires an explicit, separately reviewed decommission plan naming exact provider resource IDs. These checklists do not themselves authorize deletion.
