# Ticket 05 acceptance evidence — safe Career replacement

Date: 2026-08-12
Ticket status: **open — local application behavior verified; managed Blob, Sandbox, Neon, and private-interface evidence pending tickets 02 and 04**

No live résumé was uploaded, no managed service was called, and no private provider setting or screenshot was fabricated in this implementation session. The runtime deliberately stays unavailable until all three managed adapters are injected. OPS-002 therefore prevents ticket closure.

## Locally verified capability

- `src/ingestion/service.test.ts` drives constrained intent creation, exact-declared-size grant verification, Markdown/DOCX/text-PDF acceptance, exact complete snapshot values/order/provenance, Display normalization, harmless PDF metadata removal, the rejection corpus, prior-snapshot preservation, strict redacted Sandbox reports, duplicate hashes, immutable Publication pins, and deletion outbox creation.
- The failure matrix covers malformed/lossy/ambiguous/image-only/encrypted/macro/linked-resource documents; signature/type/hash/parser mismatches; unknown sections and duplicate conflicts; unsafe URLs, secrets, phone numbers, street addresses, unsanitized metadata, and non-allowlisted contacts; and every configured Sandbox resource bound.
- The Sandbox request contains only a Blob key and validation metadata. A report with an undeclared raw-content field fails. Provider errors and diagnostic messages are not persisted.
- `src/ingestion/deletion.test.ts` proves abandoned-intent sweeping, read-before-retry reconciliation after a timeout that applied the delete, bounded retry, stuck visibility, and one idempotent notification.
- `src/ingestion/runtime.test.ts` proves missing allowlists and any missing managed Store/Blob/Sandbox adapter fail closed.
- `src/ingestion/http.test.ts` proves owner authorization happens before mutation, request schemas exclude raw content, responses are minimal and non-cacheable, unauthenticated calls are concealed, and unavailable provider detail stays private.
- `src/ingestion/local-parser.test.ts` and `pnpm verify:career-ingestion` prove real Markdown, valid minimal DOCX, and valid text-PDF bytes traverse local Blob, parser, normalization, transactional installation, and deletion enqueue. Reproducible results are recorded in `evidence/ticket-05/local-fixture-results.json`.
- `src/ingestion/maintenance.test.ts` proves the executable maintenance unit sweeps, reconciles, escalates, and exposes aggregate stuck/notification state; private HTTP tests cover its mutation and status endpoints.
- `docs/ingestion/career-replacement.md` records the trust boundary, exact parser/Sandbox limits, private API, transactions, deletion recovery, failure-code families, and activation checklist.

## CAR-V1 fixture mapping

| Fixture | Local evidence | Result |
| --- | --- | --- |
| CAR-V1-001 | Markdown complete replacement and deletion tests | pass |
| CAR-V1-002 | DOCX dense-contract boundary, ordering, and losslessness tests | pass at application boundary |
| CAR-V1-003 | text-PDF and sanitized-metadata tests | pass at application boundary |
| CAR-V1-004 | optional arrays accepted through the Career contract | pass |
| CAR-V1-005 | original/normalized/transformation preservation test | pass |
| CAR-V1-006–008 | parentage, unknown-section, and duplicate-conflict rejection tests | pass |
| CAR-V1-009–010 | image/encryption, macro, linked-resource, and blocked-network tests | pass at application boundary |
| CAR-V1-011 | wall-time, memory, file-count, expansion, and text-size tests | pass at application boundary |
| CAR-V1-012 | privacy finding and redacted persistence tests | pass |

“Application boundary” means the strict report/policy behavior is exercised with deterministic adapters. It is not evidence that a real DOCX/PDF parser image or Vercel Sandbox enforced the control.

## Local command evidence

```text
pnpm exec vitest run src/ingestion
6 files passed; 69 tests passed

pnpm verify:career-ingestion
passed; Markdown, DOCX, and PDF real-byte fixtures installed expected snapshots

pnpm exec eslint src/ingestion app/api/control/uploads --max-warnings=0
passed

pnpm typecheck
passed

pnpm build
passed; upload intent, completion, maintenance, and status routes reported Dynamic

pnpm verify
passed: lint; typecheck; schema; 338 tests; migration rollback check;
production build; 51 browser tests across Chromium, Firefox, and WebKit
```

The full verification ran after the parallel ticket settled and supersedes the earlier focused shared-worktree observations.

## Required managed acceptance package — pending

- Ticket 02 signed provisioning evidence and ticket 04 live owner/persistent-session acceptance.
- Actual private Blob direct-upload grants proving destination, type, size, expiry, anonymous denial, environment separation, and abandoned upload reconciliation.
- Actual pinned parser image/digest plus successful Markdown, DOCX, and text-PDF fixtures with expected complete snapshots and a provenance-completeness report.
- Actual Vercel Sandbox network-denial, macro/linked-resource denial, wall-time, memory, file-count, expansion, extracted-size, encrypted/image-only, and archive-bomb evidence.
- Neon before/after transaction assertions showing every rejection preserves the prior snapshot/Last valid portfolio; duplicate/concurrent-run assertions against persistent rows.
- Provider deletion/outbox reconciliation logs for success, failure, ambiguous timeout, retries, stuck visibility, and notification delivery.
- Independent scans of model requests, audits, candidate packages, recovery data, logs, public output, and metadata showing no raw upload bytes or forbidden values.
- Owner-authenticated preview walkthrough and private upload/status/diagnostic/deletion screenshots.

Until those artifacts exist in the pinned managed environment, ticket 05 remains open even though the repository-owned capability and fail-closed boundaries are implemented.
