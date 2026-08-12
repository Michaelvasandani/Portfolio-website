# Ticket 02 acceptance evidence — repository-owned provisioning controls

Date: 2026-08-12
Ticket status: **open — pending human and provider actions**

No service was purchased or provisioned, no credential was created or rotated, no provider setting was asserted, and Michael has not signed the checklist in this implementation session. The provider-dependent Outcome and live acceptance checks therefore remain incomplete.

## Verified locally

- The public seam is the `verify:provisioning` CLI backed by exported manifest validation, least-privilege validation, environment/resource separation, a credential-free provider probe-adapter interface/executor, probe verification, and redacted artifact scanning functions.
- Red→green tests cover a runtime-parsed three-environment contract, a value-free secret-name inventory, Neon-through-Vercel-Marketplace identity, explicit Sandbox resource limits, exact HTTPS origins/callbacks, exact Actions permissions, shared-resource and shared-credential rejection, unsafe provider settings, evidence completeness, cryptographically bound sign-off, successful and denied probes for every identity, target/resource binding, non-empty scan surfaces, fail-closed malformed input, and redacted secret/endpoint findings.
- The checked-in least-privilege matrix defines eight credential roles instantiated independently in development, preview, and production, including holder, exact operations, approved store, rotation owner, and revocation path.
- The example manifest and probe documents contain identifiers/placeholders only. They intentionally retain `pending`, disabled, and `unavailable` states so they cannot be mistaken for live provider evidence.
- Repository and locally built `.next/static` scans on 2026-08-12 returned no credential or privileged-endpoint findings. This is a high-confidence pattern scan, not an exhaustive proof for arbitrary secret formats or a deployed-bundle scan.

Commands and results:

```text
pnpm vitest run src/provisioning/verify.test.ts src/provisioning/cli.test.ts
2 files passed; 28 tests passed

pnpm typecheck
passed

pnpm verify
passed: lint; typecheck; schema; 179 tests; migration rollback check; production build; 36 browser tests across Chromium, Firefox, and WebKit

pnpm tsx scripts/verify-provisioning.ts \
  --manifest docs/provisioning/manifest.example.json \
  --probes docs/provisioning/probes.example.json \
  --public-dir .next/static
exit 1; repositoryFindings=[]; publicBundleFindings=[]
```

The example verification correctly failed because PITR/domain/provider evidence and live probes are not complete. `publicBundleFindings=[]` covers the local static build only; it is not evidence that a deployed bundle was scanned. A real acceptance run must repeat the scan for the candidate/deployment output and attach provider-native scan evidence as required by the runbook.

## Required private acceptance package — pending

- Vercel Pro/team/project setting exports and distinct development/preview/production resource identifiers.
- Neon Marketplace project/role/pooling exports, backup/PITR configuration, successful scoped connections, and denied cross-environment connections.
- Private Blob setting exports, authenticated probe logs, and anonymous/cross-environment denial logs.
- Sandbox availability, pinned parser digest, resource limits, and network-denial evidence.
- Minimal GitHub App permission/callback exports, immutable owner-ID secret-store metadata, and callback denial evidence.
- GitHub Actions effective permissions and proof that only its environment-specific ingestion identity is present.
- Model provider/model/version plus structured-output, no-training, and zero-retention evidence.
- Verified environment-specific Resend domains and scoped send/denial evidence.
- Environment-scoped Vercel control-identity scope and denial evidence.
- Completed access-matrix review, revoked temporary probe credentials, repository/deployment/public-bundle/provider-native scan reports, manifest hash, and Michael's signed provisioning checklist.

Until every item above is attached without secret values and Michael signs the checklist, ticket 02 must remain open and later work must not treat the managed control plane as provisioned.

## Repository-contract audit amendment

The implementation audit corrected the Actions manifest contract to require `permissions: {}`, matching GIT-001, the traceability matrix, and the successful least-privilege token proof. A manifest that grants `contents: read` now fails validation. This repository correction does not change the ticket status or assert that an environment identity or workflow has been provisioned.
