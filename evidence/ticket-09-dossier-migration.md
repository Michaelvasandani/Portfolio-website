# Ticket 09 — Dossier publication migration evidence

Status: local migration complete; blocked pending live candidate promotion and the ticket 08 approval/provider boundary.

## Repository-local implementation

- The active `runProductionPortfolioAgent` writer now projects the generated, repository-bound portfolio into the v2 dossier and calls `publishDossier`.
- The returned publication hash comes from the v2 public manifest, so the refresh API no longer reports a legacy fixture hash after a dossier write.
- Publication storage accepts schema versions 1 and 2, writes dossier envelopes as version 2, and retains the v1 writer for explicit compatibility fixtures while `latest()` continues to read both envelopes.
- Migration `drizzle/0003_publication_dossier_v2.sql` upgrades the publication-manifest constraint without changing retained legacy rows.

## Evidence

- `pnpm exec vitest run src/agentic/publication-store.test.ts src/agentic/portfolio-agent.test.ts`: 9 passed, including v1/v2 round-trip, schema-version persistence, retained legacy reads, and active-contract hash reporting.
- `pnpm test:schema`: passed.
- `pnpm test:migrations`: passed with schema v3 and three pinned migrations.
- The existing deterministic publication orchestration evidence remains in [ticket-09](ticket-09/); its local-only provider pointers are not represented as live production evidence.

## External boundary

The workspace cannot truthfully promote a real current Career/GitHub candidate, observe a provider-created preview, or prove production routing/recovery. Ticket 08's human/provider acceptance is still open, so legacy-write retirement and production promotion remain gated rather than claimed.
