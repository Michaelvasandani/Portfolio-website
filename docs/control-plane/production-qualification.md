# Production qualification and handoff

Ticket 11 is a production acceptance exercise, not a release bypass. Run it only after tickets 01–10 have their required managed-environment evidence and their ticket status is `complete`. A completed predecessor's evidence document must also declare `Status: complete` or `closed`, link at least one nonempty repository-contained reproducible artifact, and contain no unresolved acceptance marker.

## Evidence ledger

Copy `evidence/ticket-11/production-evidence.json` into the approved private evidence workspace. Replace each pending record only after the named ordinary-path exercise succeeds. A passing record requires:

- the required `production` or `repository` scope;
- every required machine-readable claim;
- an exact, non-placeholder artifact pointer, its SHA-256 in the ledger's `artifacts` inventory, and a UTC verification time;
- `signedBy: "Michael Sagar Vasandani"` for Michael-owned actions;
- one Ed25519 owner attestation over `SHA-256(JSON.stringify({ schemaVersion, evidence, artifacts }))`, verified with a separately supplied and reviewed Michael public key.

Do not copy secret values into the ledger. Artifact paths must resolve within the configured artifact root; path traversal, missing files, and digest mismatches fail qualification. Keep Michael's private signing key outside this repository and the evidence package. Pointers may identify private provider exports, runs, deployments, reports, redacted audits, and signed checklists.

## Execution order

1. Complete provisioning, persistent owner access, live source ingestion, the production-bound Approved renderer, and the Quality baseline.
2. Run the real candidate through generate, render, validate, unique zero-traffic preview, preview validation, exact promotion, three Production-check passes across 90 seconds, and one finalization.
3. Observe the daily GitHub schedule and have Michael dispatch the manual workflow. Retain freshness and no-op evidence.
4. Exercise controlled pre-promotion rejection and post-promotion objective failure. Confirm preservation/restoration, quarantine, breaker, and notification behavior.
5. Work through raw deletion, outbox ambiguity, retry, retention, backup/PITR, notification, manual restore, breaker clearance, credential rotation, incident response, and a non-destructive decommissioning walkthrough using the normative runbooks.
6. Walk Michael through private operational state and the evidence location. Complete the signed handoff last.

Do not perform destructive decommissioning from this checklist. Deletion requires a separately approved plan naming exact provider resource IDs.

## Verify

From a workspace containing the completed evidence ledger:

```sh
pnpm verify:production-qualification \
  --evidence /path/to/private/production-evidence.json \
  --artifact-root /path/to/private/ticket-11-evidence \
  --owner-public-key /path/to/reviewed/michael-ed25519-public.pem \
  --output /path/to/private/ticket-11-evidence/generated
```

Exit code `0` means all prior tickets have nonempty closure evidence, the required package and runbook checklists are intact, local links resolve, bidirectional traceability is clean, every artifact digest resolves, and all evidence claims, scopes, timestamps, and owner signatures qualify. Exit code `1` preserves an `INCOMPLETE` report and operator handoff describing every blocker. Invalid or missing input fails closed.

The checked-in ledger is intentionally pending and the checked-in report is intentionally `INCOMPLETE`; they document the current boundary without claiming live acceptance.
