# Least-privilege access matrix

This is the mandatory scope contract. Instantiate every row separately for development, preview, and production. `Credential ID` is non-secret metadata in the form `<role>-<environment>`; the actual value exists only in the named secret store. Secret variable names are fixed by role and must never use the `NEXT_PUBLIC_` prefix.

| Credential identity | Secret variable |
| --- | --- |
| `database-runtime-<env>` | `DATABASE_URL` |
| `database-migration-<env>` | `DATABASE_MIGRATION_URL` |
| `blob-runtime-<env>` | `PRIVATE_BLOB_TOKEN` |
| `github-oauth-<env>` | `GITHUB_APP_CLIENT_SECRET` |
| `github-ingestion-<env>` | `GITHUB_INGESTION_SECRET` |
| `model-generation-<env>` | `MODEL_API_KEY` |
| `resend-notification-<env>` | `RESEND_API_KEY` |
| `vercel-control-<env>` | `VERCEL_CONTROL_TOKEN` |

| Credential identity | Environments | Holder | Exact allowed operations | Approved secret store | Rotation owner | Revocation path |
| --- | --- | --- | --- | --- | --- | --- |
| `database-runtime-<env>` | One each: development, preview, production | Vercel server runtime | `connect-pooled`, `read`, `write` in its database only | Vercel Sensitive Environment Variable, scoped to one environment | Michael | Neon role revoke/reset; redeploy consumer; prove old denial |
| `database-migration-<env>` | One each | Migration job only; represented as Vercel server holder until a dedicated job exists | `connect-direct`, `migrate-schema` in its database only | Vercel Sensitive Environment Variable, scoped to one environment | Michael | Neon role revoke/reset; update migration job; prove old denial |
| `blob-runtime-<env>` | One each | Vercel server runtime | `read-private`, `write-private`, `delete-private` in its private store only | Vercel Sensitive Environment Variable, scoped to one environment | Michael | Revoke Blob token; reconcile in-flight deletion/outbox work; prove old denial |
| `github-oauth-<env>` | One each | Vercel server runtime | `oauth-user-identity`; exact callback only | Vercel Sensitive Environment Variable, scoped to one environment | Michael | Rotate GitHub App client secret; invalidate affected sessions; prove old denial |
| `github-ingestion-<env>` | One each | GitHub Actions only | `submit-signed-snapshot` to its ingestion endpoint | GitHub Actions environment secret, scoped to one environment | Michael | Replace Actions secret and endpoint verifier together; revoke old; prove replay/old denial |
| `model-generation-<env>` | One each | Vercel server runtime | `generate-structured-output` with the pinned model only | Vercel Sensitive Environment Variable, scoped to one environment | Michael | Revoke provider key; deploy replacement; prove old denial and privacy settings |
| `resend-notification-<env>` | One each | Vercel server runtime | `send-actionable-email` from its verified domain only | Vercel Sensitive Environment Variable, scoped to one environment | Michael | Revoke restricted Resend key; reconcile notification ledger; prove old denial |
| `vercel-control-<env>` | One each | Vercel server runtime | `read-deployment`, `create-deployment`, `promote-deployment` for its project only | Vercel Sensitive Environment Variable, scoped to one environment | Michael | Revoke Vercel token; reconcile ambiguous deployment state before replacement |

GitHub Actions must never receive a database, Blob, OAuth, model, Resend, migration, or Vercel-control credential. No browser/public bundle may receive any row. Human console access is governed separately by provider team membership and must use MFA; it does not authorize copying values into ticket evidence.

## Review record

- Matrix reviewer: pending Michael
- Review date: pending
- Exceptions: none permitted; amend the contract and ticket before broadening scope
- Temporary probe credentials revoked: pending live probes
