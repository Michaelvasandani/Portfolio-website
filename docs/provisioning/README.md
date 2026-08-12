# Managed control-plane provisioning contract

This directory defines the repository-owned half of ticket 02. It does not assert that any provider resource exists. Provider purchases, resource creation, credential creation or rotation, live probes, evidence capture, and final sign-off remain Michael's actions under the [provisioning runbook](../../.scratch/agentic-portfolio-implementation/runbooks/README.md#provisioning).

Never place a credential value, connection string, private endpoint, or unredacted provider export in these files. The verifier accepts identifiers, secret-store references, scopes, redacted evidence references, and probe outcomes only.

## Verification inputs

Create two ignored or otherwise securely handled local JSON files:

1. A provisioning manifest matching the exported `ProvisioningManifest` contract in `src/provisioning/verify.ts`. Start from `manifest.example.json`, replacing every `REPLACE_` identifier. A credential ID is metadata, not its value.
2. A JSON array of `ConnectionProbe` records. Each credential requires an allowed probe against its own environment resource and a denied probe against the same service in another environment. `redactedLogRef` must point to retained redacted evidence, never embed output.

Provider-specific probe implementations plug into the exported `ConnectionProbeAdapter` and call `executeConnectionProbes`. A plan contains only credential metadata and target IDs; an adapter resolves the credential internally from its approved secret store and returns only `allowed`, `denied`, or `unavailable`. It must never return response bodies, headers, connection strings, or credential values. The checked-in code intentionally supplies no adapter that can access a paid provider.

Provider secret-setting exports must be reduced to variable names before validation. Pass that name-only inventory to `validateEnvironmentSecretNames`; do not load or serialize `process.env`. The validator requires every role declared for the environment, rejects undeclared privileged names, and rejects every `NEXT_PUBLIC_` name.

Then build and verify:

```bash
pnpm build
pnpm verify:provisioning -- \
  --manifest /secure/path/provisioning-manifest.json \
  --probes /secure/path/redacted-probes.json \
  --public-dir .next/static
```

All three inputs, including a non-empty `--public-dir`, are mandatory. Point it at the complete locally inspectable public-bundle output for the acceptance build, not one hand-selected file. Exit `0` means all repository checks passed and the supplied manifest records complete provider evidence and cryptographically bound signed human approval. Exit `2` means the supplied service contract and probe results pass but provider evidence or human sign-off remains. Exit `1` means validation failed, a scan surface was empty, or input could not be safely evaluated. The JSON report contains only errors, pending actions, artifact paths, finding categories, and 12-character one-way fingerprints.

The verifier checks:

- development, preview, and production resource and credential separation;
- exact per-environment HTTPS origins and OAuth callbacks;
- Vercel Pro, Neon Marketplace, pooled runtime access, separate migration identity, and PITR;
- private Blob, a network-denied pinned Sandbox with explicit CPU, memory, timeout, file-count, and extracted-size limits, minimal GitHub App permissions, and isolated Actions ingestion with exactly `contents: read`;
- structured model output with training disabled and zero retention, plus verified environment-specific Resend domains;
- exact least-privilege operations, approved environment-scoped secret stores, rotation ownership, and revocation paths;
- fixed server-only secret variable names, with any `NEXT_PUBLIC_` credential rejected;
- a successful intended probe and a denied cross-environment probe for every credential identity; and
- high-confidence credential patterns and privileged PostgreSQL endpoints in repository and public-bundle text.

The pattern scan covers common credential formats, remote PostgreSQL URLs, Neon hosts, private Blob hosts, and Vercel, Resend, and OpenAI control APIs. It supplements provider secret scanning; it is not proof that an arbitrary secret format or provider endpoint is absent. Provider-native scans and the later exhaustive publication leak corpus remain required.

## Evidence handling

Use opaque references such as a private Drive path, provider activity-log event ID, or internal evidence record. Redact account email, user IDs, tokens, connection hosts, database users, private URLs, and payloads. Screenshots must show only the setting name, state, environment, redacted resource ID, and capture date. Review the [least-privilege matrix](access-matrix.md) before running probes, revoke temporary probe credentials afterward, and mark ticket 02 accepted only after Michael Sagar Vasandani signs every runbook item. A signed manifest requires his exact owner/reviewer name, an exact UTC ISO timestamp, a non-placeholder private ticket-02 evidence reference, the exact runbook statement, and the verifier-computed canonical manifest SHA-256; changing any manifest setting invalidates that hash.
