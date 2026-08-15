# 04 — Showcase Portfolio projects with safe Evidence artifacts

**What to build:** Give selected Portfolio projects a varied evidence-led presentation while preserving autonomous selection, using a safe typeset repository artifact as the complete baseline for every project.

**Blocked by:** 02 — Open the living technical dossier.

**Status:** resolved

- [x] Existing eligibility, pin inclusion, fill-toward-five, six-pin, scoring, diversity, stability, and source-authority behavior produces the same selected projects as before the redesign.
- [x] The two selected projects with the strongest AI relevance receive wide showcases; relevance ties follow existing selected order; remaining projects use the denser responsive layout.
- [x] Project prominence changes presentation only and never changes selection membership or removes an eligible pin.
- [x] Every selected project can render a complete typeset repository Evidence artifact using only verified public repository name, description, language, topics, and metadata.
- [x] Each Evidence artifact declares its kind and retains private provenance in the candidate manifest while exposing no internal evidence identifiers publicly.
- [x] One-project, fewer-than-target, five-project, six-pin, missing-description, long-name, and long-technology scenarios remain readable and visually intentional.
- [x] Repository and verified demonstration links remain descriptive, keyboard accessible, and correct at every project prominence tier.
- [x] Browser acceptance proves the wide and dense layouts linearize into one meaningful mobile reading order without overflow or hidden content.

## Answer

Added a repository-backed `typeset-repository` Evidence artifact as the universal safe project presentation. Composition now derives prominence from existing selected order plus AI relevance, preserves autonomous selection membership, records artifact hashes and source field paths privately in the candidate manifest, and scans the public artifact without exposing internal evidence IDs. The v2 projection, fixture metadata, renderer, and responsive styles now show repository name, description fallback, language, topics, release/update metadata, prominence tiers, and descriptive repository/verified demonstration actions.

Acceptance evidence:

- Focused composition, selection, renderer, publication-store, and dossier checks — 5 files, 32 tests passed.
- `pnpm verify` passed: 57 Vitest files / 517 tests, schema and migration checks, production build, and 57 Chromium/Firefox/WebKit browser tests.
- Composition tests cover selection invariance, relevance/tie prominence, missing-description fallback, content-addressed artifacts, private provenance, and public leak scanning; renderer tests cover sparse project metadata and verified demonstration links.
- Review of the ticket diff against pushed ticket 03 found no blocking issues; unrelated working-tree changes remain unstaged.
