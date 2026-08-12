# Ticket 01 — Foundations acceptance evidence

Environment: macOS arm64, Node.js 22.23.1, pnpm 10.4.1. Recorded 2026-08-12.

## Reproduction

```bash
corepack pnpm install --frozen-lockfile
pnpm verify
```

The command runs the pinned linter and TypeScript compiler; validates the v1 domain/database schema inventory and its content hash; executes all unit, contract, environment, and 51 fixture assertions; applies the pinned migration to an ephemeral PostgreSQL-compatible PGlite database; proves an intentionally failed transactional migration leaves schema v1 usable; builds the Next.js application; and starts it under Chromium, Firefox, and WebKit.

## Recorded results

- Lockfile/package-manager: pnpm 10.4.1, frozen install passed.
- Domain schema: v1, 13 required versioned contracts. Run `pnpm test:schema` for the recorded content hash.
- Migration: v1, `drizzle/0001_foundations.sql`, SHA-256 `f94404ebb699a16062cbbcd061956883e66267745c22ed6368411b8e5018bae0`; apply and rollback-preservation checks passed.
- State transitions: every ordered Publication-run step, active-step failure, preview validation/promotion/production validation, quarantine, and illegal transition rejection passed.
- Fixtures: all 51 stable catalogue IDs at v1.0.0 passed their machine-readable contract assertions. Later tickets implement the source, generation, check, and recovery capabilities that execute those contracted outcomes. Run `pnpm test:fixtures -- --reporter=verbose` for the per-ID contract matrix.
- Environment: valid configuration, missing/malformed rejection, unrelated host-variable handling, and local test credentials passed.
- Browser tooling: Chromium, Firefox, and WebKit foundation smoke checks passed.
- Full acceptance: post-review `pnpm verify` passed with 6 Vitest files and 141 tests plus 3 browser tests. The final schema hash was `sha256:d4ebcebf810322e863ed04d040b83b2ec55dd722181a45a62b33950ca62a899e`.

No production credential is present in this evidence or required by any local verification command.
