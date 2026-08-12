# Ticket 08 — Publication-check acceptance evidence

Status: locally executable contracts complete; ticket remains open pending a provider-created zero-traffic immutable preview.

Normative configuration hash: `sha256:e76c65695e08dadb1ebb6f3069ca70651a9dbc85af5712225423672fccf6d405`.

## Reproduce

```sh
pnpm verify:publication-checks
pnpm exec vitest run src/publication-checks
pnpm typecheck
```

The verifier begins with a clean production build, then runs current candidate composition, PDF content/order validation, Playwright/axe across Chromium, Firefox, and WebKit, three-run Lighthouse and transfer gates, and veraPDF. It parses only those current-run reports; enumerates and scans every publicly emitted app/static/public text and binary/metadata artifact; serves the exact build for internal route, résumé, asset, robots, sitemap, and social-image status/type/hash probes; exercises candidate-introduced HTTPS links with the pinned HEAD/GET/redirect/retry policy; and compares the exhaustive public-output hash with the current composition candidate and manifest. It records the contract-positive fixture separately from the real local-artifact run, 56 negative/warning fixtures covering each threshold and rule clause, a real timeout/fresh-attempt and three-attempt fail-closed demonstration, the requirement/check inventory, pinned environment and threshold manifest, collector execution record, and evidence-retention schema under [`ticket-08/`](ticket-08/).

The normative configuration pins Node, pnpm, Lighthouse, axe, Playwright, veraPDF, browser engine versions/revisions, all 15 browser/viewport combinations, 200% zoom, WCAG text spacing, forced colors, reduced motion, 44px targets, Lighthouse throttling and all score/metric/transfer/regression thresholds, link retry behavior, checker versions/rules/classification, retry policy, and retention. The runner rejects configuration or checker-definition drift and missing, stale, crashed, timed-out, or contradictory results.

Subjective visual concerns, content-driven screenshots, field Core Web Vitals, and exhausted transient third-party failures are retained warnings. Objective identity, manifest, provenance, completeness, Public projection, leak, copy, accessibility, responsive, performance, SEO, structured-data, link, asset, résumé, PDF/UA, and checker-integrity failures block.

## External acceptance boundary

The real local-artifact run correctly blocks because the current public routes still render the Approved-renderer fixture rather than ticket 07's composed candidate; ticket 09 owns retrieving and deploying the immutable candidate package. Ticket 02 also remains open, this environment has no provisioned Vercel project or scoped control credential, and a unique Vercel zero-traffic deployment cannot be created truthfully. This ticket therefore cannot claim the live preview URL, provider deployment identity, or provider-observed manifest/public-output hash required by PUB-003. The machine-readable blocker is [`external-acceptance-blockers.json`](ticket-08/external-acceptance-blockers.json). Ticket 03 already retains the approved manual accessibility baseline and pinned veraPDF reports; those are linked rather than claimed as missing.

Until the live deployment run exists, failures leave Last valid unchanged by contract and the ticket remains open; no blocking check is waived or converted to a pass.
