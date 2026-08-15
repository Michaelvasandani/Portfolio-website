# 06 — Present Capability groups and the hiring close

**What to build:** Replace the résumé-like skills inventory with evidence-backed Capability groups and complete the dossier with the approved production-AI Contact invitation and résumé actions.

**Blocked by:** 02 — Open the living technical dossier.

**Status:** resolved

- [x] Skills project into AI Systems, Backend & APIs, Data & ML, Product Interfaces, and Infrastructure using repository-owned mapping policy and Career snapshot evidence.
- [x] Source spellings remain unchanged, each skill appears in at most one best-fit Capability group, and empty groups are omitted cleanly.
- [x] No proficiency scores, experience estimates, decorative technology logos, or unsupported skills are emitted.
- [x] The Skills & Tools presentation communicates the capability before listing its concise toolkit and remains scannable with dense source input.
- [x] Contact closes with “Building production AI? Let’s talk.” and presents email as the primary action with GitHub and LinkedIn as secondary actions.
- [x] Public résumé HTML and tagged-PDF actions remain available from both the Dossier index and the closing area.
- [x] Contact labels are concise on screen while retaining descriptive accessible names and correct destinations.
- [x] Sparse skills, dense skills, long tool names, narrow screens, keyboard navigation, and no-script rendering pass browser acceptance without hidden or duplicated content.

## Answer

Added a repository-owned capability policy that maps supported Career snapshot skills into canonical groups, preserves source spellings, deduplicates skills, and omits unsupported or empty groups. The renderer now leads with capability-group cards and closes with the approved production-AI invitation, concise contact actions, descriptive accessible names, and the existing résumé HTML/tagged-PDF actions.

## Evidence

- Focused dossier and renderer tests: 21 passed.
- Full verification: 521 Vitest tests, lint, typecheck, schema validation, migrations, production build, and 59 of 60 browser tests passed.
- The single WebKit Dossier-index anchor test was rerun independently and passed; Chromium and Firefox were already passing.
