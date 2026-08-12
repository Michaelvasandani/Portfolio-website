# Establish the Approved renderer

Status: ready-for-agent
Blocked by: 01 (Establish foundations and executable contracts)

## Outcome

The Engraved Folio renders every public Portfolio and résumé surface from representative fixtures and has an initial human-approved visual and manual-accessibility baseline.

## Included

- Implement Card, About, Experience, Projects, Résumé, Links, accessible Public résumé HTML and tagged PDF, metadata, sitemap, robots, structured data, social image, last-updated timestamp, and public manifest hash.
- Implement the original warm-paper editorial system, responsive linearization, semantic structure, keyboard and focus behavior, forced colors, reduced motion, text zoom and spacing, and content-driven layout.
- Use fixture data only; establish sparse, typical, dense, long-word, optional-section, and six-pin render baselines.
- Pin licensed fonts and all material renderer dependencies.

## Excluded

- Live ingestion, project ranking, unconstrained narrative generation, deployment promotion, or copying protected film material.

## Acceptance checks

- All public surfaces render every required field and section from fixtures in the specified order without truncation or hidden content.
- Automated responsive and accessibility checks pass at the required browser/viewport matrix, 200% zoom, text-spacing override, forced colors, and reduced motion.
- The generated PDF passes content-order checks and the pinned PDF/UA validator on all applicable fixtures.
- The pinned three-run Lighthouse and transfer-budget gates pass for representative sparse and dense fixtures.
- Michael approves the visual baseline plus keyboard, VoiceOver/Safari, and NVDA/Chrome results; the Approved-renderer commit and dependency/configuration hashes are recorded.

## Acceptance evidence

Link fixture screenshots, DOM/layout reports, browser matrix, accessibility reports, PDF validator and extraction results, three-run Lighthouse results, asset budgets, renderer hashes, and Michael's approval comment.

## Failure and recovery

Any renderer-affecting change after approval invalidates the baseline until the same approval checks pass again. Source-only wrap and height changes do not invalidate approval.

## Requirements

PRD-001, PRD-002, PRD-003, CNT-001, CNT-002, CNT-003, SRC-002, QAL-002, QAL-003, QAL-004, QAL-005, OPS-001, OPS-002
