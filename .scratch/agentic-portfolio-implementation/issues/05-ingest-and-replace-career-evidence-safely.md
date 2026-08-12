# Ingest and replace career evidence safely

Status: ready-for-agent
Blocked by: 01 (Establish foundations and executable contracts), 02 (Provision the managed control plane), 04 (Establish owner access and the operational shell)

## Outcome

Michael can submit a supported résumé as a complete replacement and receive either a lossless immutable Career snapshot or an actionable rejection while raw bytes are deleted and the prior snapshot remains safe.

## Included

- Issue constrained client-upload tokens and accept Markdown, DOCX, and text-based PDF up to 10 MB.
- Verify file signature, declared type, hash, parser compatibility, encryption/image-only status, and upload intent.
- Parse in a pinned ephemeral network-disabled Sandbox with resource and expansion limits and no macro execution or linked-resource retrieval.
- Normalize every recognized field into the Career contract with field/source provenance and recorded Display normalization.
- Detect ambiguous parentage, unknown material sections, duplicate conflicts, dropped text, unsafe URLs, secrets, phone numbers, street addresses, metadata, and non-allowlisted contacts.
- Install a new immutable snapshot transactionally and enqueue raw deletion; surface status and diagnostics privately.

## Excluded

- OCR, partial merge, LinkedIn ingestion, model processing of raw files, publication generation, or public deployment.

## Acceptance checks

- Every valid-format positive fixture produces the expected complete snapshot, order, verbatim values, provenance, and normalized values.
- Every malformed, lossy, ambiguous, image-only, oversized, encrypted, macro, archive-bomb, secret, phone, address, metadata, and linked-resource fixture fails with its expected code and preserves the prior snapshot.
- Network-denial, time, memory, file-count, and extracted-size bounds are proven in the Sandbox.
- Successful and failed attempts enqueue deletion; retries converge; a stuck deletion becomes visible and notifiable; no raw bytes enter model requests, audits, candidate packages, or recovery data.
- Duplicate upload hashes behave idempotently and concurrent replacement attempts cannot mutate an in-flight Publication run.

## Acceptance evidence

Link fixture results, parser image/hash, sandbox-policy tests, before/after database assertions, provenance completeness report, privacy scan, deletion/outbox reconciliation log, and private-interface screenshots.

## Failure and recovery

Any failure preserves the prior Career snapshot and Last valid portfolio. Raw deletion continues independently through the outbox and sweeper until confirmed or escalated.

## Requirements

SRC-001, SRC-002, CAR-001, CAR-002, CAR-003, PUB-002, PUB-005, QAL-001, OPS-002
