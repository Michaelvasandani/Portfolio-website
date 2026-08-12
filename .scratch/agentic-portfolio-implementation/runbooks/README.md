# Agentic Portfolio — Operational Runbooks

Status: normative checklists
Version: 1.0.0

Never paste credential values into this repository, tickets, screenshots, logs, or audit evidence. Record only secret-store name, credential identity, scope, owner, created/rotated date, and provider resource identifier.

## Provisioning

Human owner: Michael

Complete every row independently for development, preview, and production. For each checked row, record a date and an opaque redacted-evidence reference in the private ticket evidence package. A provider console screenshot is not acceptable until account email, user IDs, secret values, connection hosts, and private endpoints are redacted.

- [ ] Confirm Vercel Pro team ownership, MFA, billing approval, and three distinct project/resource identifiers; record plan and project-setting exports.
- [ ] Connect three distinct Neon PostgreSQL projects through Vercel Marketplace; create pooled runtime and separate direct migration roles; verify backups and point-in-time recovery; record redacted role, pooling, and PITR exports.
- [ ] Create three private Vercel Blob stores; prove authenticated access succeeds and anonymous read/list plus cross-environment identity access fail.
- [ ] Confirm Vercel Sandbox access; pin the parser image by digest; configure network default-deny plus explicit CPU, memory, timeout, file-count, and extracted-size limits; retain one allowed-control, one resource-limit, and one network-denial log.
- [ ] Create three GitHub Apps with only identity metadata read; store Michael's immutable numeric GitHub user ID and client secrets in the matching Vercel Sensitive Environment Variable scope.
- [ ] Register one exact HTTPS origin and OAuth callback per environment; reject wildcard, wrong-origin, replayed, and cross-environment callbacks.
- [ ] Create one Actions ingestion identity per environment; use only the matching GitHub Actions environment secret and set `permissions: {}` so the built-in `GITHUB_TOKEN` has no configurable permissions; prove the workflow has no database, Blob, OAuth, model, Resend, migration, or Vercel-control credential.
- [ ] Select and record a provider, model, and pinned version satisfying GEN-001 structured output; obtain provider evidence that training is disabled and retention is zero for every environment identity.
- [ ] Verify three distinct Resend sending subdomains/domains; restrict each identity to actionable email from its environment domain; retain verified-domain exports and expected-denial logs.
- [ ] Create three environment-scoped Vercel control identities restricted to read/create/promote operations for their own project; do not grant team administration, billing, secret read, or unrelated-project access.
- [ ] Review and sign the repository [least-privilege matrix](../../../docs/provisioning/access-matrix.md); confirm every credential has a holder, exact operations, approved environment-scoped store, Michael as rotation owner, and a provider revocation path.
- [ ] Populate a credential-free provisioning manifest and run an allowed and cross-environment denied probe for every identity with `pnpm verify:provisioning`; revoke any temporary probe credential and prove it is denied afterward.
- [ ] Build the site and scan the repository, deployment output, source maps, headers/settings export, and public bundle; retain the redacted JSON verifier report plus provider-native secret-scan output.
- [ ] Attach all redacted provider-setting exports, resource identifiers, probe logs, scan reports, PITR state, and matrix review to the private evidence package.
- [ ] Michael Sagar Vasandani records final sign-off as both owner and reviewer with an exact UTC ISO date, canonical manifest SHA-256, non-placeholder private evidence-package reference, and the statement: “All provisioning checklist items are complete; no credential value is present in evidence.” Rerun verification after binding the hash; any later manifest change invalidates sign-off.

Stop and leave ticket 02 open if environment boundaries are unclear, a resource identifier or credential is shared, any service is public by default, a scope exceeds the matrix, a denied probe succeeds, a probe target is not the recorded resource, a temporary credential remains active, evidence is missing, or evidence would expose a secret.

## Owner access and session recovery

- [ ] Confirm the environment-specific GitHub App client ID/secret, immutable numeric owner ID, exact callback, and `OWNER_SESSION_SECRET` exist only in the matching Vercel Sensitive Environment Variable scope; no `NEXT_PUBLIC_` variant exists.
- [ ] Confirm preview and production use a durable transactional `OwnerAccessStore`; an unavailable adapter must fail closed and must never fall back to process memory.
- [ ] Exercise a successful Michael login and a denied valid non-owner login; retain only redacted event references and one-way actor fingerprints.
- [ ] Exercise missing, mismatched, expired, and replayed OAuth state plus a forged/failed code exchange; confirm no session is issued and the external failure stays generic.
- [ ] Inspect the session, CSRF, and OAuth cookies for `Secure`, `HttpOnly`, `__Host-`, bounded `Max-Age`, and the intended `SameSite` policy.
- [ ] Exercise unauthenticated, expired, revoked, and forged sessions against every private page and API; confirm generic `404`, `no-store`, `noindex`, and no private content or diagnostic.
- [ ] Exercise missing, forged, and cross-origin CSRF proofs on logout and every mutation; confirm the operation does not run.
- [ ] Rotate the GitHub App client secret and `OWNER_SESSION_SECRET` together, deploy the replacement, revoke the old OAuth secret, and prove every old OAuth state/session cookie is denied before closing the change.
- [ ] Run `pnpm verify:owner-access` against the acceptance build and deployed output, attach provider-native scans and header/cache captures, and inspect redacted logs/error responses for the private leak corpus.

Stop and leave ticket 04 open if the persistent store or provider identity is uncertain, a private route returns a distinguishable diagnostic, a cookie lacks a required attribute, an old session survives rotation, or any public artifact/cache/log/error response contains a credential, owner identifier, private state, or control endpoint.

## Credential rotation

- [ ] Obtain Michael's change approval; name the exact credential ID and environment from the [least-privilege matrix](../../../docs/provisioning/access-matrix.md). For suspected compromise, skip ordinary scheduling and begin **Incident response** immediately.
- [ ] Identify credential, environments, holder, dependent components, provider revocation behavior, and incident status.
- [ ] Create a replacement with equal or narrower scope in the approved secret store.
- [ ] Record only new credential metadata, creation date, scope, and secret-store reference; never export or diff its value.
- [ ] Deploy consumers without printing the value; prove successful use in the intended environment and expected denial in another environment.
- [ ] Revoke the old credential and verify it fails.
- [ ] Invalidate sessions when OAuth/session material changed; reconcile in-flight outbox/provider operations before rotating Vercel or Blob control credentials.
- [ ] For database migration/runtime roles, verify the old role cannot connect; for Actions ingestion, verify old signatures fail; for provider APIs, retain a redacted denied response fingerprint.
- [ ] Update credential metadata and rotation date, not the value; rebuild consumers when required and run repository, deployment, and public-bundle scans.
- [ ] Record completion, verifier-report reference, provider activity-event reference, and next review date; delete local temporary files containing the value through the approved secret-handling process.
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
