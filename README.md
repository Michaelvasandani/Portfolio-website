# Agentic Portfolio

Michael Vasandani's autonomous portfolio. In production, a secured daily Vercel Cron run collects current public GitHub repository evidence, asks a schema-constrained model through Vercel AI Gateway to select and describe three representative projects, validates the result, and writes an immutable publication to Neon. The public page reads the newest valid publication and preserves its prior content whenever collection, generation, validation, or persistence fails.

Vercel deployments authenticate to AI Gateway with their automatically provisioned OIDC token, so production does not require a model API key. The refresh endpoint is `GET /api/agent/refresh` and requires the `CRON_SECRET` bearer token; `vercel.json` schedules it once daily.

## Pinned toolchain

- Node.js 22.23.1 for local and CI reproducibility (`.nvmrc`); managed deployments may use a compatible Node.js 22 patch (`engines`)
- pnpm 10.4.1 (`packageManager`)
- Next.js 16.3.0, React 19.2.8, TypeScript 5.9.3
- Vitest 4.1.10 and Playwright 1.51.1
- Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, and Zod 4.4.3

Install exactly what the lockfile records:

```bash
corepack pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
```

## Verification

The complete local acceptance command runs lint, type checking, schema inventory, all unit/contract/fixture/environment tests, the transactional migration and rollback check, a production build, and the three-engine browser smoke test:

```bash
pnpm verify
```

Focused commands are also stable public checks:

```bash
pnpm test:contracts
pnpm test:fixtures
pnpm test:environment
pnpm test:schema
pnpm test:migrations
pnpm test:browser
pnpm verify:production-qualification
```

The production-qualification command intentionally exits nonzero while live provider and Michael-owned acceptance evidence remains pending. It still writes a fail-closed report and operator handoff under `evidence/ticket-11/`; use the private-path arguments documented in [`docs/control-plane/production-qualification.md`](docs/control-plane/production-qualification.md) for the real handoff package.

Local environment configuration starts from [`.env.example`](.env.example). `loadEnvironment` fails closed when a required value is absent or malformed. Tests use only loopback/local placeholder credentials from `testEnvironment`; production credentials are neither required nor permitted in test configuration.

## Contract and fixture versions

All foundation domain contracts accept only `schemaVersion: 1`. The database starts at schema version 1 with a content-pinned, transactional migration. The 51 fixtures in [`fixtures/v1/catalog.json`](fixtures/v1/catalog.json) implement normative catalogue version `1.0.0`; fixture IDs are immutable, so input or outcome changes require a new version and ID.

Reproducible ticket-01 acceptance evidence and hashes are recorded in [`evidence/ticket-01.md`](evidence/ticket-01.md).
