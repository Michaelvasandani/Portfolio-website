# 05 — Add verified project screenshots and diagrams

**What to build:** Upgrade eligible project Evidence artifacts with verified deployment screenshots or evidence-derived line-work diagrams while retaining the typeset artifact as the reliable fallback.

**Blocked by:** 04 — Showcase Portfolio projects with safe Evidence artifacts.

**Status:** resolved

- [x] Screenshot capture accepts only a reachable HTTPS demonstration URL already verified and bound to the same repository by GitHub evidence.
- [x] Arbitrary URLs, redirects to unexpected identities, HTTPS downgrades, unverified homepages, and runtime visitor-side screenshot fetching are rejected.
- [x] Captured screenshots use bounded execution, deterministic viewport rules, useful alternative text, and content hashes recorded in the candidate manifest.
- [x] A line-work diagram names only components, relationships, and workflow stages supported by verified repository documentation or code evidence, with private evidence references for every claim.
- [x] Missing, insufficient, ambiguous, or contradictory diagram evidence bypasses diagram generation without inventing architecture.
- [x] Artifact precedence is verified screenshot, evidence-derived diagram, then typeset repository artifact.
- [x] Capture or diagram-generation failure produces an observable Quality warning and the next safe artifact rather than rejecting an otherwise valid Portfolio project.
- [x] Final artifacts are content-addressed, included in the immutable candidate package, covered by the public leak scan, and served without third-party runtime dependencies.
- [x] Browser fixtures visibly exercise and distinguish screenshot, diagram, and typeset fallback presentations across wide and narrow project layouts.

## Answer

Added validated screenshot and evidence-derived diagram artifact candidates with explicit precedence over the ticket-04 typeset repository fallback. Screenshot candidates require an HTTPS demonstration URL that matches the repository’s verified homepage binding, an identity confirmation, a bounded 1440×900×1 viewport, a repository-local public path, useful alt text, and a content hash. Diagram candidates require repository-local output, nonempty private evidence paths, alt text, and a content hash. Invalid candidates produce manifest quality warnings and fall back safely; public artifacts contain no internal evidence identifiers or remote runtime URLs.

Acceptance evidence:

- Focused artifact/composition/renderer tests — 3 files, 23 tests passed.
- `pnpm verify` passed: 57 Vitest files / 518 tests, schema and migration checks, production build, and 57 Chromium/Firefox/WebKit browser tests.
- Tests distinguish verified screenshot, invalid-screenshot-to-diagram fallback, and typeset fallback, while checking private diagram provenance and public leak absence.
- Review against pushed ticket 04 found and corrected evidence-graph handling for artifact presentation metadata; unrelated working-tree changes remain unstaged.
