# 02 — Open the living technical dossier

**What to build:** Replace the uniform post-card reading shell with the living technical dossier, including the approved section journey, wider responsive rhythm, About education presentation, and accessible Dossier index while preserving the opening Card view.

**Blocked by:** 01 — Establish backward-compatible dossier publication.

**Status:** resolved

- [x] The visible journey is Card, I About, II Experience, III Projects, IV Skills & Tools, and V Contact; no separate homepage Résumé or Links section remains.
- [x] The Card view is materially unchanged and its “Read the work” action enters the new About section.
- [x] About presents the preserved owner-authored introduction followed by résumé-synchronized university, degree, graduation date, GPA when supplied, and at most four deterministically selected relevant courses.
- [x] The post-card page remains one continuous warm-paper surface and introduces the wider editorial rhythm, charcoal typography, thin rules, and accessible oxblood annotation system without unrelated card or dark-theme treatments.
- [x] The Dossier index becomes persistent after the Card view, identifies the current section, links to every section and the Public résumé, and does not obscure focused or anchored content.
- [x] Sparse or missing optional education data produces a complete, intentional About layout without invented content or empty labels.
- [x] Browser acceptance covers meaningful mobile linearization, keyboard navigation, visible focus, forced colors, reduced motion, 200% zoom, text spacing, and no horizontal overflow.

## Answer

Implemented the living technical dossier renderer on top of the ticket 01 v2 publication projection. The public fallback and fixture routes now exercise the v2 journey; stored v1 publications remain readable through the compatibility renderer during the migration window. The opening Card markup and content remain unchanged, while the post-card surface now has the approved About, Experience, Projects, Skills & Tools, and Contact order, a wider responsive editorial rhythm, deterministic education course selection, a sparse-safe education layout, and a progressive-enhancement Dossier index with current-section state, résumé links, keyboard focus, and anchored-content clearance.

Acceptance evidence:

- `pnpm test:renderer` — 4 renderer test files / 14 tests and 48 Chromium, Firefox, and WebKit browser tests passed.
- `pnpm verify` — lint, typecheck, schema check, 57 Vitest files / 509 tests, migration check, production build, and 57 browser tests passed.
- Browser coverage includes mobile linearization, keyboard navigation, visible focus, forced colors, reduced motion, no-script readability, 200% zoom, WCAG text spacing, overflow, sparse/dense fixtures, and résumé access.
- Code review against ticket 01 commit `a7d269c7aa6040d5c83aa977c45406412bebd615` covered Standards and Spec axes; no blocking findings.
