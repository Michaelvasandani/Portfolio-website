# Career replacement runbook

## Safety boundary

The application accepts a résumé only as a complete Career replacement. The owner-authenticated control API records an upload intent before it asks private Blob for a direct-client grant. The grant is accepted only when its destination, MIME type, exact declared byte size (no more than 10 MB), and five-minute expiry exactly match the recorded intent. A timeout or widened grant is treated as ambiguous and enters raw-deletion reconciliation.

Raw bytes do not cross the application service. The service passes the private Blob key, declared type, and expected hash to the Sandbox adapter. The pinned parser must return the strict redacted report in `src/ingestion/service.ts`; extra properties—including raw text or bytes—reject the report. There is no model, candidate-package, audit, or recovery-data dependency in this path.

The repository includes a real-byte executable harness at `scripts/verify-career-ingestion.ts`. It creates Markdown bytes, a valid minimal uncompressed DOCX package, and a valid text PDF; uploads them through `LocalBlobProvider`; parses them through `PinnedLocalCareerSandbox`; and installs them through the same service/store transaction. `pnpm verify:career-ingestion` prints fixture hashes, snapshot identities, and deletion state. The pinned result is `evidence/ticket-05/local-fixture-results.json`.

This harness proves the repository parser and application boundary. It does not claim OS/process isolation or a managed Vercel Sandbox. `runtime.server.ts` remains unavailable until persistent Neon, private Blob, and managed Sandbox adapters are injected.

The pinned parser contract is:

| Control | Required value |
| --- | --- |
| Parser | local harness `portfolio-career-parser` version `1.0.0`; managed adapter must report the expected immutable image identity in code (its existence is not yet evidenced) |
| Network | `none`; every attempted connection must be reported blocked |
| Wall time | 15 seconds |
| Memory | 512 MiB |
| Files | 128 |
| Expanded input | 40 MiB |
| Extracted text | 2 MiB |
| Macros | never execute |
| Linked resources | never retrieve |

The report independently binds detected type, signature result, source byte count, SHA-256, parser compatibility, encryption/image-only status, macro and linked-resource presence, metadata removal, network denial, resource measurements, recognized/extracted character counts, findings, and the complete normalized Career draft. Every accepted draft is parsed again through the Career contract before installation. The service also requires its source-document hash to equal the upload/computed hash, a nonblank person name, supported supplied date forms, and public HTTPS project URLs. Loopback, private/link-local, `.local`, `.internal`, credential-bearing, and LinkedIn project URLs are rejected. LinkedIn remains only the exact approved outbound contact.

## Private API

All endpoints require the existing owner session, exact origin, and the CSRF token in `x-csrf-token`. Responses are private, `no-store`, `nosniff`, and non-indexable.

- `POST /api/control/uploads/intent` accepts only `filename`, `declaredType`, `size`, and `expectedHash`. It returns the constrained direct-upload grant and the public-projection/confidentiality warning.
- `POST /api/control/uploads/complete` accepts only the recorded `intentId` and exact `objectKey`. It returns an accepted snapshot identity or an actionable stable rejection code.
- `POST /api/control/uploads/maintenance` runs one bounded abandoned-intent/deletion reconciliation pass.
- `GET /api/control/uploads/status` returns only aggregate pending, leased, applied, stuck, and pending-notification counts.

The API never accepts a multipart résumé or raw-content field. Unknown fields fail validation. Unauthenticated requests are concealed; an authenticated deployment without all managed adapters returns a truthful generic unavailable response.

## Transaction and deletion behavior

`CareerIngestionStore` is the transactional authority seam. A successful transaction installs one immutable snapshot, advances the current pointer, records the outcome, and creates the raw-deletion intent. A rejection transaction preserves the prior pointer, records only a stable failure code, and creates the same deletion intent. Duplicate source hashes return the existing snapshot identity without creating or changing a snapshot. Existing Publication runs retain their pinned Career snapshot ID.

`UploadIntentSweeper` moves expired abandoned uploads into deletion reconciliation. `RawDeletionWorker` leases one record, reads Blob provider state before every delete, uses a stable idempotency key, and confirms absence. Ambiguous timeouts retry with bounded backoff. When the 15-minute window expires, the record becomes `stuck` and one idempotent `stuck-raw-deletion` notification is enqueued.

`CareerIngestionMaintenance` wires both workers into one executable unit used by the private maintenance and status endpoints. A provider scheduler may invoke the mutation endpoint, but no scheduler is claimed until ticket 02 provisions and authenticates it.

## Failure-code families

- Intent/grant: unsupported type, unsafe intent, size, expiry, widened grant, or provider unavailable.
- File/parser: signature, hash, parser identity/compatibility, encryption, image-only, malformed input, macros, or linked resources.
- Losslessness: ambiguous parentage, unknown material section, conflicting duplicate, dropped text, or invalid normalization.
- Privacy: unsafe URL, secret, phone number, street address, unsanitized metadata, or non-allowlisted contact.
- Sandbox: policy/report drift, network escape, wall time, memory, file count, archive expansion, extracted text, or provider unavailable.

Diagnostics stored by the application are stable codes and structural locations only. Provider exception messages and finding messages are deliberately discarded.

## Managed activation checklist

This repository does not claim the managed path is active. Before activation:

1. Complete ticket 02 and obtain signed provider evidence for environment-separated private Blob, Neon, and pinned Vercel Sandbox resources.
2. Implement and inject the persistent Neon `CareerIngestionStore`, private Blob grant/deletion adapter, and pinned Sandbox adapter. Do not use `InMemoryCareerIngestionStore` in preview or production.
   Confirm the expected parser-image identity resolves to the provisioned immutable image and rerun every fixture before injection.
3. Configure the exact public Email, GitHub, and LinkedIn allowlist values in each environment.
4. Run the CAR-V1 fixture corpus through real Markdown, DOCX, and PDF objects and retain parser-image, network-denial, resource-bound, database before/after, provenance, privacy, and deletion logs.
5. Exercise owner-authenticated intent and completion calls in preview, capture the private status/deletion screens, and verify the emitted/public surfaces contain no raw markers.
6. Reconcile every raw object to confirmed absence, including an ambiguous delete timeout and a deliberately stuck deletion notification.

Do not mark ticket 05 complete until this provider-native package passes in the pinned environment.
