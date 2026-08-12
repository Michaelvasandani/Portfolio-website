# Ticket 03 — Approved-renderer acceptance evidence

Status: automated renderer qualification complete; human approval pending.

## Reproduce

```sh
python3 -m pip install -r requirements-renderer.txt
pnpm renderer:pdf
pnpm test:renderer:pdf
pnpm build
pnpm test:renderer:quality
pnpm renderer:matrix
pnpm test:renderer
```

The renderer quality command runs three cold mobile-form-factor Lighthouse 13.4.1 passes for both sparse and dense fixtures in a pinned local production environment. It pins simulated mobile throttling to 40 ms RTT, 10,240 Kbps throughput, and 2× CPU slowdown and applies every score, metric, no-poor-band, and transfer threshold per fixture. It also gates axe/Lighthouse accessibility, production SEO, JavaScript and transfer budgets, and veraPDF 1.30.2 PDF/UA-1 validation. Full configuration, environment, hashes, and results are recorded in [ticket-03/quality-summary.json](ticket-03/quality-summary.json). Raw reports remain beside the summary.

## Automated results

- Renderer baselines: sparse, typical, dense, long-word, optional-section, and six-pin fixture routes.
- Screenshot baselines: desktop and mobile captures for all six fixture routes under [ticket-03/screenshots](ticket-03/screenshots).
- Browser matrix: Chromium, Firefox, and WebKit at 320×568, 390×844, 768×1024, 1440×900, and 1920×1080, plus 200% zoom, text-spacing override, forced colors, reduced motion, keyboard focus, and 44×44 targets.
- Public surfaces: Portfolio, accessible résumé HTML, downloadable tagged PDF, robots, sitemap, canonical/Open Graph metadata and social image, allowlisted Person/ProfilePage JSON-LD, last-updated timestamp, and public manifest hash.
- DOM/layout/accessibility evidence: 20 route-and-viewport entries with heading inventories, overflow measurements, and axe 4.13.0 results in [ticket-03/dom-layout-accessibility.json](ticket-03/dom-layout-accessibility.json), plus the cross-browser executable matrix.
- PDF: exact normalized visible-text equality and structural checks across all six fixture PDFs, plus zero failures from veraPDF 1.30.2's `ua1` profile for every fixture. See the `ticket-03/verapdf-ua1-*.json` reports.
- Performance/asset gates: see the machine-readable quality summary for six individual runs, medians, and byte totals.
- Fonts: Source Serif 4 version 4.005, licensed under SIL OFL 1.1 and stored with its license; font and renderer dependency hashes are included in the committed tree and quality summary.
- LinkedIn boundary: rendered only as an outbound allowlisted contact link; no LinkedIn ingestion or automation dependency exists.

## Human checkpoint — pending

The automated evidence does not claim Michael's visual approval or manual keyboard, VoiceOver/Safari, or NVDA/Chrome approval. Until Michael records that approval against the final renderer commit and the supplied sparse/dense/long-word/zoom/forced-colors/reduced-motion baselines, the renderer is a qualified approval candidate, not a human-approved baseline, and autonomous promotion must remain blocked.
