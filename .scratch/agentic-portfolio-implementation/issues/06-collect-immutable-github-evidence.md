# Collect immutable GitHub evidence

Status: ready-for-human
Blocked by: 01 (Establish foundations and executable contracts), 02 (Provision the managed control plane), 04 (Establish owner access and the operational shell)

Local evidence: [`../../../evidence/ticket-06.md`](../../../evidence/ticket-06.md)

## Outcome

Daily and manually dispatched collection produces signed, immutable, reproducible GitHub snapshots without privileged repository tokens or damage to the prior valid snapshot.

## Included

- Implement scheduled and `workflow_dispatch` Actions using `permissions: {}` and the built-in token.
- Query pins and repository graph by GraphQL and fetch README, topics, languages, releases, activity, source structure and other defined evidence by REST with conditional requests and bounded retries.
- Normalize source and rendered-content semantics, record partial fetch outcomes, and send signed content-addressed payloads to the private endpoint.
- Verify repository/workflow identity, signature, schema, replay window, payload size, and content hash; persist immutable snapshots and freshness state.
- Surface missed schedules, failed collections, ambiguous external availability, and duplicate deliveries privately.

## Excluded

- LinkedIn observation, GitHub webhooks as the sole reconciliation mechanism, project ranking, narrative generation, or publication promotion.

## Acceptance checks

- Scheduled and manual runs both produce the expected snapshot for a controlled fixture repository set using only metadata-read token access.
- Current public pin order and required response shape are captured; a duplicate hash is a successful no-op.
- Tampered signatures, wrong repository/workflow identity, stale/replayed payloads, unknown schema, mismatched hash, and oversized payloads are rejected and audited.
- Conditional requests reduce unchanged retrieval without changing normalized hashes; mechanical activity does not become meaningful activity.
- Failed or missed collection preserves the prior GitHub snapshot, exposes diagnostics, and triggers notification only under the specified policy.

## Acceptance evidence

Link Actions run URLs, effective token permissions, normalized snapshot/hash, API response-contract tests, signed-delivery tests, duplicate/replay tests, conditional-request report, and missed-sync evidence.

## Failure and recovery

Collection or delivery failure leaves the prior valid GitHub snapshot untouched. A snapshot older than 48 hours remains servable only through the Last valid portfolio and blocks new promotion.

## Requirements

SRC-001, SRC-002, GIT-001, GIT-002, PUB-002, PUB-005, QAL-006, OPS-002
