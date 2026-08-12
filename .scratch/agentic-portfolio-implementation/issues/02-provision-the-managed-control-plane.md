# Provision the managed control plane

Status: ready-for-human
Blocked by: 01 (Establish foundations and executable contracts)

## Outcome

Development, preview, and production environments have the decided managed services, least-privilege identities, secrets, retention settings, and rotation ownership required by later slices.

## Included

- Provision Vercel Pro, a Next.js project, Neon PostgreSQL through Vercel Marketplace, private Vercel Blob, Vercel Sandbox access, a minimal-permission GitHub App, Resend, and a model provider satisfying the generation contract.
- Separate development, preview, and production resources and credentials.
- Configure pooled database access, migration identity, Blob privacy, allowed origins and callbacks, GitHub App identity, Actions ingestion secret, Vercel control credential, model privacy settings, Resend domain, and Neon point-in-time recovery.
- Create the human-owned provisioning and credential-rotation checklist in the runbook; store secrets only in approved secret stores.

## Excluded

- Application functionality, production publication, live source ingestion, or placing any credential value in the repository or ticket evidence.

## Acceptance checks

- Michael completes and signs off every item in [the provisioning checklist](../runbooks/README.md#provisioning).
- A least-privilege matrix identifies each credential, holder, environment, allowed operations, rotation owner, and revocation path without recording secret values.
- Automated connection probes succeed from their intended environment and fail from an unauthorized environment or identity.
- Blob objects are private, database access is pooled and environment-scoped, OAuth callbacks and Resend domain are verified, and point-in-time recovery is enabled and evidenced.
- A public-bundle and repository scan finds no secrets or privileged service endpoints.

## Acceptance evidence

Link redacted provider-setting exports or screenshots, resource identifiers, access-matrix review, successful and denied probe logs, secret scan, backup configuration, and Michael's checklist sign-off.

## Failure and recovery

Incomplete or overprivileged setup keeps this ticket open. Revoke test credentials after probes; follow the rotation checklist for any accidental disclosure.

## Requirements

CAR-001, CAR-003, GIT-001, PUB-001, PUB-005, OPS-001, OPS-002, HOF-002
