# Ticket 03 — Approved-renderer acceptance evidence

Status: complete — Approved renderer baseline established.

Renderer candidate commit: `88f62b232cc6b2824c5ba33ea2890c07f84f18ad`.
Approval recorded: `2026-08-12T15:55:29Z`.
Pinned quality-configuration SHA-256: `06cdddbb0bd878924b29db49a69eb9a98e3e65a17b95158740017de53245782a`.

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
- Browser matrix: Chromium, Firefox, and WebKit at 320×568, 390×844, 768×1024, 1440×900, and 1920×1080, plus explicit 320/390px identity word-integrity checks, 200% zoom, text-spacing override, forced colors, reduced motion, keyboard focus, and 44×44 targets.
- Public surfaces: Portfolio, accessible résumé HTML, downloadable tagged PDF, robots, sitemap, canonical/Open Graph metadata and social image, allowlisted Person/ProfilePage JSON-LD, last-updated timestamp, and public manifest hash.
- DOM/layout/accessibility evidence: 20 route-and-viewport entries with heading inventories, overflow measurements, and axe 4.13.0 results in [ticket-03/dom-layout-accessibility.json](ticket-03/dom-layout-accessibility.json), plus the cross-browser executable matrix.
- PDF: exact normalized visible-text equality and structural checks across all six fixture PDFs, plus zero failures from veraPDF 1.30.2's `ua1` profile for every fixture. See the `ticket-03/verapdf-ua1-*.json` reports.
- Performance/asset gates: see the machine-readable quality summary for six individual runs, medians, and byte totals.
- Fonts: Source Serif 4 version 4.005, licensed under SIL OFL 1.1 and stored with its license; font and renderer dependency hashes are included in the committed tree and quality summary.
- LinkedIn boundary: rendered only as an outbound allowlisted contact link; no LinkedIn ingestion or automation dependency exists.

## Human approval

Human visual review first rejected an intra-word surname break in the earlier mobile baseline. Renderer commit `88f62b232cc6b2824c5ba33ea2890c07f84f18ad` corrects that defect, adds a public-browser regression test, and regenerates the affected acceptance evidence.

Michael Sagar Vasandani was then presented with the corrected visual baseline and the complete manual approval scope: keyboard behavior, VoiceOver/Safari, NVDA/Chrome, sparse and dense content, long words, zoom, forced colors, and reduced motion. At `2026-08-12T15:55:29Z`, Michael responded: **“I approve.”** This approval is recorded against renderer commit `88f62b232cc6b2824c5ba33ea2890c07f84f18ad`, the dependency and artifact hashes in `quality-summary.json`, and quality-configuration hash `06cdddbb0bd878924b29db49a69eb9a98e3e65a17b95158740017de53245782a`.

The approval interface did not expose a durable conversation URL or message identifier. This checked-in approval section is therefore the canonical approval-comment pointer: it preserves the approver, exact response, UTC timestamp, reviewed scope, renderer identity, and configuration identity in version-controlled acceptance evidence.

This commit is the Approved renderer baseline. Any later change to templates, semantics, interaction, typography metrics, layout rules, PDF generation, or a materially renderer-affecting dependency invalidates this approval and requires the ticket-03 qualification and human checkpoint to run again.
