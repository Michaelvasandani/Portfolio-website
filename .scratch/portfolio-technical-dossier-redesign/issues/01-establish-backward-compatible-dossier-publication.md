# 01 — Establish backward-compatible dossier publication

**What to build:** Add the next Public projection and publication-envelope version beside the current version so a living-technical-dossier candidate can travel through composition, persistence, retrieval, and server rendering without disturbing the Card view or the Last valid portfolio.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The new public contract can represent About education, generated Experience narratives and evidence callouts, project prominence and Evidence artifacts, Capability groups, Contact, and the Publication status strip.
- [x] A valid new-version publication can be composed, stored, read back, and rendered through the ordinary public-page path.
- [x] Existing valid publications remain readable and serveable throughout the expansion period.
- [x] The existing Card view retains its observable content, semantics, layout, navigation, and responsive behavior for both publication versions.
- [x] Unknown versions, malformed envelopes, invalid public hashes, and incomplete new projections fail closed without replacing the Last valid portfolio.
- [x] Automated compatibility evidence covers new-version round trips, current-version reads, invalid-version rejection, and Last-valid preservation.

## Answer

Implemented the expand-contract publication seam without changing the existing v1 write format. `dossier-publication.ts` defines the hashed schema-version-2 Public projection and publication envelope, plus composition from the current renderer fixture. The publication store validates both envelope versions, writes v2 beside v1, and walks newest-to-oldest rows so malformed or invalid newer rows cannot displace the newest valid publication. The server and public renderer now accept either version; the v2 renderer carries the existing Card inputs unchanged while exposing the new dossier fields.

Acceptance evidence:

- `pnpm exec vitest run src/agentic/dossier-publication.test.ts src/agentic/publication-store.test.ts src/renderer/portfolio-compatibility.test.ts` — 3 files, 7 tests passed.
- `pnpm verify` — lint, typecheck, schema check, 56 test files / 506 tests, migration check, production build, and 51 Chromium/Firefox/WebKit browser tests passed.
- The compatibility tests cover v2 composition and hash round-trip, v1 read compatibility, unknown/malformed/incomplete/hash-invalid newer envelopes, Last-valid preservation, and v2 Card/public rendering.
- Code review against `HEAD` `df53d494935648822eaf4e6cda9338290a3bbc7f` covered Standards and Spec axes; no blocking findings. Unrelated working-tree changes remain unstaged.
