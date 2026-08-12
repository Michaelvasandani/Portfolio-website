# Agentic Portfolio

The repository foundation for Michael Vasandani's autonomous Portfolio. It currently provides the pinned Next.js runtime, strict versioned domain contracts, trust-boundary validators, state machines, migration baseline, and normative executable fixture catalogue. Source ingestion, candidate generation, full rendering, deployment, and production operation belong to later implementation tickets.

## Pinned toolchain

- Node.js 22.23.1 (`.nvmrc` and `engines`)
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
```

Local environment configuration starts from [`.env.example`](.env.example). `loadEnvironment` fails closed when a required value is absent or malformed. Tests use only loopback/local placeholder credentials from `testEnvironment`; production credentials are neither required nor permitted in test configuration.

## Contract and fixture versions

All foundation domain contracts accept only `schemaVersion: 1`. The database starts at schema version 1 with a content-pinned, transactional migration. The 51 fixtures in [`fixtures/v1/catalog.json`](fixtures/v1/catalog.json) implement normative catalogue version `1.0.0`; fixture IDs are immutable, so input or outcome changes require a new version and ID.

Reproducible ticket-01 acceptance evidence and hashes are recorded in [`evidence/ticket-01.md`](evidence/ticket-01.md).
