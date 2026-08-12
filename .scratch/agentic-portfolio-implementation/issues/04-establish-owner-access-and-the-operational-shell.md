# Establish owner access and the operational shell

Status: ready-for-agent
Blocked by: 01 (Establish foundations and executable contracts), 02 (Provision the managed control plane)

## Outcome

Only Michael can enter the private control plane, and its shell safely exposes upload, run, deployment, diagnostic, recovery, deletion, outbox, and notification state without leaking privileged data publicly.

## Included

- Complete server-side GitHub App OAuth with state validation, identity lookup, immutable numeric-ID authorization, short-lived HTTP-only secure sessions, CSRF protection, logout, and audit events.
- Build private navigation and empty/loading/error states for upload, publication runs, deployments, checks, breaker, restore/retry, source freshness, raw deletion, outbox, and notifications.
- Enforce server-only data access and field-level redaction.

## Excluded

- Actual parsing, source collection, publication, rollback, restore execution, or editorial approval workflows.

## Acceptance checks

- Michael's configured numeric GitHub ID can authenticate; a different valid GitHub user is denied and audited.
- Replayed or mismatched OAuth state, expired sessions, CSRF attempts, and forged callbacks are rejected.
- Unauthenticated requests to private routes and APIs disclose neither content nor existence-sensitive diagnostics.
- Public bundles, pages, cache entries, logs, and error responses contain no OAuth secret, session token, private identifier, evidence graph, service credential, or control endpoint.
- Every planned operational entity has a truthful nonfunctional shell state rather than a fabricated success state.

## Acceptance evidence

Link OAuth/session integration tests, authorization matrix, negative security tests, public-bundle/leak scan, cache/header inspection, and private-shell route inventory.

## Failure and recovery

Authentication or authorization uncertainty fails closed. Session and OAuth credential rotation follows the runbook and invalidates affected sessions.

## Requirements

CAR-001, PUB-001, PUB-004, PUB-005, QAL-001, OPS-002
