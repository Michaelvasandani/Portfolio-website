# 03 — Publish evidence-bound Experience stories

**What to build:** Turn every Career snapshot role into the strongest supported first-person Experience story and present the roles as an accessible, linkable timeline without altering the comprehensive Public résumé.

**Blocked by:** 02 — Open the living technical dossier.

**Status:** resolved

- [x] Every Career snapshot role remains present in source order with verbatim employer, title, location, and dates.
- [x] Experience is a supported evidence-bound generation placement whose clauses retain private references to the exact résumé evidence used.
- [x] The generator may condense, reorder, and connect source bullets and choose natural structure and length, including a short account when evidence is thin.
- [x] Unsupported or altered numbers, responsibilities, technologies, outcomes, opinions, causal claims, protected factual fields, or evidence references reject the Publication candidate and preserve Last-valid state.
- [x] Supported situation, shipped-system, production-impact, and evidence callouts are rendered when present without forcing a deterministic prose template.
- [x] The latest role begins expanded; every other role has a useful visible summary and a keyboard-operable disclosure; all role content remains readable when scripting is unavailable.
- [x] Every role has a stable collision-resistant anchor, and direct navigation opens and focuses the requested role without trapping focus.
- [x] Semantic résumé changes regenerate only affected Experience copy; unchanged evidence reuses validated prior output.
- [x] The Public résumé HTML and PDF retain their comprehensive source-ordered Experience content without generated homepage narratives.

## Answer

Added `experience` as an evidence-bound generation placement. Composition now creates one request per Career snapshot role, carries clause-level evidence references into the private candidate manifest/evidence graph, validates first-person copy and supported vocabulary, and reuses unchanged role narratives by evidence hash. The v2 renderer presents each role as a source-ordered disclosure timeline with visible summaries, evidence callouts, stable role anchors, hash navigation, and an all-open server-rendered fallback for no-script access. Durable role identity excludes mutable bullet text so deep links survive evidence edits.

Acceptance evidence:

- Focused composition/generator/renderer checks — 3 files, 27 tests passed after the anchor-stability correction.
- `pnpm lint && pnpm typecheck` passed.
- `pnpm verify` passed: 57 Vitest files / 513 tests, schema and migration checks, production build, and 57 Chromium/Firefox/WebKit browser tests.
- Review of the ticket diff against pushed ticket 02 found and corrected mutable evidence in role anchors; unrelated working-tree changes remain unstaged.
