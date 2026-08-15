# Ticket 08 — Redesigned renderer qualification evidence

Status: local qualification complete; blocked pending the required human visual/accessibility approval and provider-created zero-traffic preview.

## Local verification

The redesigned renderer was checked after ticket 07 with the repository-owned quality gates:

- `pnpm exec vitest run src/renderer/dossier.test.ts`: 11 passed, including every safe Evidence artifact kind and local artifact paths.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test:browser`: 60 passed across Chromium, Firefox, and WebKit, including responsive, no-script, keyboard, reduced-motion, forced-colors, 200% zoom, target-size, overflow, and axe coverage.
- `RENDERER_REPORT_DIRECTORY=evidence/ticket-08-redesigned-renderer RENDERER_FIXTURE_DIRECTORY=evidence/ticket-03 pnpm test:renderer:quality`: passed with median Lighthouse Performance 100, compressed JavaScript 130,317 bytes, and initial transfer 291,756 bytes. The report and pinned veraPDF results are in [ticket-08-redesigned-renderer](ticket-08-redesigned-renderer/).
- `RENDERER_BASELINE_DIRECTORY=evidence/ticket-08-redesigned-renderer/screenshots pnpm renderer:baselines`: captured 26 screenshots covering all six fixtures at mobile and desktop sizes, collapsed and expanded Publication status, and collapsed/latest plus expanded Experience states.

The renderer test also covers the unchanged Card view, About, timeline disclosures, both project prominence tiers, safe screenshot/diagram/typeset artifact rendering, Capability groups, Contact, Dossier index, résumé actions, and Publication status.

## Acceptance boundary

The local gates do not constitute the required human approval for a materially changed Approved renderer, and they do not create the provider-owned immutable zero-traffic preview required for production qualification. Those are intentionally left open rather than claimed by local evidence. Ticket 09 remains responsible for the normal publication/promotion path once this approval and preview boundary is available.
