# Ticket 06 acceptance evidence — immutable GitHub collection

Date: 2026-08-12

Ticket status: **open — local workflow, collector, receiver, and policy contracts verified; live Actions and durable managed-service evidence blocked by tickets 02 and 04**

No Actions workflow was dispatched, no effective token-permission export was captured, no private endpoint or Neon adapter was available, no durable audit/snapshot/freshness record was written, and no notification was sent in this implementation session. This document does not claim live acceptance.

## Verified local contract coverage

- `src/github/workflow.test.ts` fixes both daily and manual triggers, enforces workflow-level `permissions: {}` with only the built-in `GITHUB_TOKEN`, and requires an explicit Actions environment so receiver/signing secrets can be environment-scoped; no PAT or fine-grained token is configured.
- `src/github/provider.test.ts` fixes the public GraphQL request shape, conditional REST headers/304 reuse, and a three-attempt retry bound.
- `src/github/collector.test.ts` covers current pin order, owner identity, metadata, README source/rendered semantics, topics, languages, releases, REST activity, formatting/bot/chore-versus-meaningful activity, source structure, conditional evidence/rendered hash stability, outcome-bound content hashes, required/optional partial classification, and truncated-tree rejection.
- `src/github/workflow-runtime.test.ts` covers credential-free conditional-cache persistence, validated run/workflow identity, refusal to deliver an incomplete snapshot, payload addressing, exact-body signing, and bounded private delivery.
- `src/github/receiver.test.ts` covers strict full nested schema rejection, immutable installation, successful duplicate-hash no-op, signature/repository/workflow/schema/replay-window/payload-hash/all-snapshot-hash/size rejection, required-evidence preservation, changed-content replay rejection, rejection audit, and failure preservation of the prior snapshot.
- `src/github/http.test.ts` covers JSON media enforcement, declared and actual streamed byte limits, stalled-body timeout, generic rejection responses, duplicate response shape, no-store headers, and fail-closed unavailability.
- `src/github/retry.test.ts` fixes the shared bounded retry and exponential-delay contract used by GitHub API and receiver delivery clients.
- `src/github/freshness.test.ts` covers the exact 48-hour promotion boundary, continued Last-valid serving, missed schedules, and idempotent notification intent policy.
- `src/github/runtime.test.ts` proves the deployed runtime cannot select the in-memory test double and remains unavailable without a durable store.

## Local command evidence

```text
pnpm exec vitest run src/github
10 files passed; 43 tests passed

pnpm typecheck
passed

pnpm lint
passed

pnpm verify
passed: lint; typecheck; schema; 338 unit/integration tests; migration rollback check;
production build; 51 browser tests across Chromium, Firefox, and WebKit
```

## Acceptance still required in the pinned managed environment

- Scheduled and `workflow_dispatch` run URLs against the controlled fixture repository set.
- Effective `GITHUB_TOKEN` permission evidence showing `permissions: {}` and successful public metadata access.
- Deployed normalized snapshot and content, evidence, and rendered hashes, tied to the run and durable immutable row.
- Deployed API response-contract, signed-delivery, duplicate, replay, conditional-request, failure-preservation, freshness, and missed-schedule artifacts.
- Durable audits for every rejection category without payload/secret leakage.
- A transactionally created, idempotent Resend outbox intent for a missed schedule, plus proof that routine success and ambiguous external availability do not notify.

Ticket 02 remains open pending provider provisioning and Michael's sign-off. Ticket 04's durable-store acceptance is also pending. Under OPS-002, code completion and local test doubles cannot close ticket 06.
