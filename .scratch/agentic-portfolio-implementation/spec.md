# Agentic Portfolio — Implementation Specification

Status: normative
Version: 1.0.0
Decision source: [Agentic Portfolio decision map](../agentic-portfolio/map.md)

## 1. Purpose and authority

This specification defines the observable product behavior, domain and data contracts, trust boundaries, operating constraints, acceptance thresholds, and recovery semantics for Michael's autonomous Portfolio. The implementation is complete only when the linked backlog and production-qualification boundary have been satisfied.

Normative terms such as **Portfolio**, **Career snapshot**, **Publication candidate**, **Valid deployment**, and **Last valid portfolio** use [the project glossary](../../CONTEXT.md). `MUST`, `MUST NOT`, `SHOULD`, and `MAY` carry their usual requirements meanings.

When handoff artifacts conflict, authority descends in this order:

1. this `spec.md`;
2. contracts and acceptance thresholds explicitly referenced by this specification;
3. [implementation tickets](issues/);
4. [the glossary](../../CONTEXT.md), for terminology only;
5. prototypes, research, and Wayfinder resolutions, as rationale only.

A contradiction blocks affected work until this specification and [the traceability matrix](traceability.md) are amended. Reversible local choices—module seams, function names, ordinary refactors, and equivalent techniques—remain with the builder when they do not alter a requirement below.

## 2. Product and presentation

### PRD-001 — Audience and journey

The Portfolio MUST serve AI and software-engineering hiring teams. It MUST be one continuous page whose primary journey is to inspect selected work and then contact Michael. Its order MUST be **Card, About, Experience, Projects, Résumé, Links**. Email MUST be reachable from the Card and Links.

### PRD-002 — Engraved Folio

The Portfolio MUST implement the Engraved Folio: a near-full-viewport warm-ivory Card with centered identity, charcoal licensed old-style serif typography with true small caps where used, restrained peripheral metadata, ample whitespace, subtle procedural paper texture, and restrained material depth. After the first scroll, the same paper-and-ink system MUST continue into a narrow editorial column using Roman-numeral section labels, thin rules, generous intervals, and alignment rather than nested cards.

It MUST be an original composition. Film imagery, dialogue, fictional company content, branding, copied coordinates, replica typography, deliberate prop errors, phone-number treatment, or exact prop imitation MUST NOT appear.

### PRD-003 — Responsive semantic rendering

Experience and Project entries MAY use metadata and evidence columns on large screens but MUST linearize into one meaningful reading order on narrow screens. The page MUST use live semantic text, visible focus, visibly underlined links, at least `1rem` body text with comfortable line height, content-driven height, and hierarchy-preserving responsive behavior. Desktop coordinates MUST NOT simply be shrunk for mobile.

An **Approved renderer** is required before autonomous promotion. Changes to templates, semantics, interaction, typography metrics, layout rules, PDF generation, or a dependency that materially affects them MUST invalidate the approval and require a new visual and manual-accessibility baseline. Source-only content changes MAY reuse an Approved renderer.

### CNT-001 — Editorial thesis and voice

The repository-owned Presentation policy MUST position Michael primarily as an engineer of dependable agentic AI systems, supported by broader software and data-engineering evidence. If current evidence cannot support that thesis, it MUST use a repository-owned software-and-data-engineering fallback and record the fallback in the audit.

The Card MUST include one evidence-bound proof sentence of 15–25 words. About MUST contain a first-person lede and one paragraph totaling no more than 100 words. First person MUST NOT appear outside Card and About. Generated text MUST NOT invent motivations, aspirations, values, opinions, ownership, impact, adoption, awards, production status, or behavior. Proof and About copy MUST regenerate only after a semantic change to recorded supporting evidence.

### CNT-002 — Complete career presentation

Experience MUST show every Career-snapshot role and bullet in source order. Résumé-matched Portfolio projects MUST show every matching source bullet after the project description. Source-authored titles, organizations, degrees, project and skill names, headings, and bullets MUST remain verbatim. They MUST NOT be selected, shortened, rewritten, truncated, hidden, collapsed, or placed in a carousel.

Display normalization MAY change whitespace, safe typography, URL form, and date presentation while preserving the original value and meaning. Every normalization MUST be recorded. Grammar or spelling checks MUST NOT silently alter source-authored text.

### CNT-003 — Résumé and links

The on-page Résumé section MUST show all education, skills, GPA, coursework, and populated recognized optional sections, but MUST NOT repeat Experience or Projects. It MUST link to a complete accessible Public résumé in HTML and a downloadable tagged PDF.

The Public résumé MUST contain the complete sanitized Career snapshot in source order. A high-confidence Résumé project match MAY add its repository link. GitHub-only projects and the raw upload MUST NOT enter it.

Email, GitHub, and LinkedIn MUST appear on the Card and in Links. Each Portfolio project MUST link to its repository and MAY link to a verified live demonstration supplied by GitHub evidence. Links MUST use descriptive labels, MUST remain underlined, and MUST NOT force new tabs. LinkedIn is outbound only.

## 3. Source authority and ingestion

### SRC-001 — Authority by field

The Career snapshot owns résumé-authored identity, career, education, skills, projects, optional-section facts, and approved contact links. GitHub owns repository identity, functionality, implementation, repository links, releases, and activity. Presentation policy owns eligibility, selection, ordering, framing, allowlists, and public metadata.

A material contradiction about the same objective fact MUST reject the Publication candidate unless dates or explicit wording establish distinct historical states. The system MUST NOT silently rewrite, omit, or reconcile a conflict.

### SRC-002 — LinkedIn boundary

LinkedIn MUST NOT be an ingestion source. API workarounds, scraping, authenticated or public browser automation, visual computer-use observation, extensions, and persistent-session agents are prohibited. LinkedIn MAY appear only as an outbound approved contact link. Data-export import, portability APIs, and approved partner integrations are outside this version of the specification.

### CAR-001 — Owner-authenticated upload

The private interface MUST authenticate through a minimal-permission GitHub App and authorize only Michael's configured immutable numeric GitHub user ID. OAuth state MUST be verified server-side. New sessions MUST verify the authenticated GitHub identity and use short-lived secure HTTP-only cookies.

The uploader MUST accept Markdown, DOCX, and text-based PDF up to 10 MB. It MUST verify declared type, file signature, size, hash, and parser compatibility independently. It MUST reject encrypted, image-only, malformed, ambiguous, unreadable, or materially lossy documents and MUST NOT apply OCR. Each valid upload is a complete replacement, never a merge.

The browser MUST upload directly to private Blob using a short-lived, single-purpose token constrained by content type, size, and destination. The control plane MUST record upload intent before issuing the token and reconcile abandoned or partially completed uploads.

### CAR-002 — Isolated parsing and Career snapshot

Raw documents MUST be parsed in an ephemeral, pinned, network-disabled Vercel Sandbox. The parser MUST NOT execute macros or fetch linked resources and MUST enforce bounds on wall time, memory, file count, archive expansion, and extracted-text size. Raw document content MUST NOT be sent to a language model.

A Career snapshot MUST be immutable and contain:

| Group | Required contract |
| --- | --- |
| Person | Name; location when supplied; allowlisted public contact links. |
| Experience | Organization, title, location, structured dates, source order, ordered verbatim bullets. |
| Education | Institution, degree, location, structured dates, GPA and coursework when supplied, source order, ordered verbatim details. |
| Résumé projects | Name, technologies, source links, source order, ordered verbatim bullets. |
| Skills | Source-named groups with ordered verbatim items. |
| Optional sections | Typed awards, certifications, publications, and volunteering with retained source heading, content, and order. |
| Provenance | Source-document hash, source location, original value, optional normalized value and transformation, and source order for every entity and field. |

A replacement MUST have a person name, recognizable material boundaries, unambiguous bullet parentage, parseable supplied dates, safe URLs, and preservation of every recognized item. Unknown material sections, conflicting duplicate records, dropped text, ambiguous parentage, or materially lossy extraction MUST fail normalization and preserve the prior Career snapshot.

A valid Career snapshot does not expire with age; it remains authoritative until a later valid complete replacement is installed.

### CAR-003 — Sanitization and deletion

The system MUST state that uploaded content is intended for public projection, while warning Michael to exclude employer-confidential narrative. Before installation or publication it MUST block credentials, secrets, phone numbers, street addresses, hidden metadata, and non-allowlisted contact fields.

The raw Blob MUST be deleted after successful normalization and after every failed attempt completes. PostgreSQL MUST record a deletion outbox intent in the same transaction as the outcome; a sweeper MUST reconcile and retry deletion and alert when the bounded deletion window is exceeded. Raw bytes MUST NOT be recovery data.

### GIT-001 — GitHub collection

A repository workflow MUST run daily and via `workflow_dispatch`. It MUST use the built-in `GITHUB_TOKEN` with `permissions: {}`; no fine-grained public-read token is required for public pins. It MUST use GraphQL for profile pins and repository graph data and REST for preferred README, topics, languages, releases, and other evidence, using conditional requests and bounded retries.

The collector MUST normalize evidence, distinguish semantic source changes from rendered-content changes, and send a signed, content-addressed snapshot to a private control-plane endpoint. The receiver MUST verify signature, expected repository and workflow identity, schema version, timestamp and replay window, content hash, and payload limits. A duplicate hash MUST be a successful no-op.

### GIT-002 — GitHub snapshot and freshness

A GitHub snapshot MUST be immutable and bind collection time, owner identity, pin order, repository metadata, evidence documents and hashes, topics, languages, releases, meaningful activity, fetch outcomes, and source URLs. Failed or missed collection MUST NOT replace the latest valid snapshot.

A new Publication candidate MUST use a GitHub snapshot captured no more than 48 hours before its Publication run. An older snapshot MAY remain in the Last valid portfolio but MUST NOT support a new promotion.

## 4. Project selection and generated content

### PRJ-001 — Eligibility and evidence

A Portfolio project MUST be public, original, substantive, attributable to Michael by ownership or explicit contribution evidence, sufficiently evidenced for a conservative description, and relevant to AI, software, data, or adjacent engineering. Forks, archives, disabled or empty repositories, mirrors, template-only scaffolds, context-poor experiments, unexplained source, configuration-only repositories, unimplemented ideas, generated-assets-only repositories, and coursework fragments are ineligible.

Evidence MUST be inspected in this order: repository metadata, preferred README, and topics; repository-owned project or architecture documentation; manifests, substantive source structure, tests, build and deployment metadata; releases and meaningful default-branch activity. Sufficient evidence requires either two corroborating GitHub evidence classes or one such class plus a high-confidence Résumé project match. A file tree or dependency manifest alone is insufficient.

### PRJ-002 — Selection and ranking

Every eligible current pin MUST be selected. Eligible unpinned projects MUST fill toward a target of five total projects. The Portfolio MUST publish fewer when fewer qualify and MUST publish all six if all six pins qualify. Weak projects MUST NOT fill a quota, and an eligible pin MUST NOT be removed for score or diversity.

Eligible projects MUST be scored out of 100: pin 35; high-confidence Résumé match 30; evidence and technical substance 20, divided equally among clear purpose, substantive implementation, engineering proof, and traceable specifics; audience relevance 10; recency 5, awarded as 5 within 90 days, 3 within one year, 1 within two years, otherwise 0. Stars, forks, watchers, and raw commit counts MUST NOT affect ranking. Mechanical activity MUST NOT count as meaningful recency.

Selection is lexicographic: eligible pins first, then score. Initial ties MUST break by evidence score, relevance score, pin position, then case-folded repository name.

Current source evidence is expected to select the eligible pins `clinical-trial-finder`, `ClosetOS`, `Keeping-Up-AI`, and `Voice-Agent` and to score all eligible unpinned repositories for any addition. Repository identities, candidate identities, scores, and current ordering MUST NOT be hard-coded.

### PRJ-003 — Résumé matching and description

A direct repository URL establishes a high-confidence Résumé project match. Otherwise, a normalized name or clear alias plus at least two independent corroborating facts is required. Ambiguous or conflicting matches MUST remain unmatched and observable without approval or publication failure.

Every selected project MUST have one 12–30-word sentence describing the user problem, primary capability, and distinguishing technical evidence when supported. Each factual clause MUST cite evidence identifiers internally. Unsupported clauses MUST be omitted rather than hedged. GitHub-only projects MUST NOT receive generated substitute bullets.

### PRJ-004 — Diversity and stability

When selecting an unpinned addition, diversity by problem domain, product shape, and primary technical capability MAY prefer a candidate within 8 points of the highest-scoring candidate. Selected projects within 5 points MAY be reordered for diversity. Diversity MUST NOT override eligibility, remove a pin, or beat a candidate more than 8 points stronger.

Eligibility, pin-set, or high-confidence-match changes MUST apply immediately. Otherwise, an unpinned challenger MUST lead an incumbent by at least 8 points on two consecutive daily reconciliations; reorder only across a score difference of at least 5; and preserve selection and order when recency-bucket change is the sole cause. Descriptions MUST regenerate only after semantic evidence change and publish only when rendered-content hash changes. Prior selection, order, score components, evidence, matching, and consecutive comparison MUST be retained.

### GEN-001 — Evidence-bound generation

Deterministic code MUST assemble selection and an evidence packet from pinned Source snapshots. Verbatim fields MUST bypass the model. Generation MUST receive only sanitized evidence and MUST return schema-constrained sentences and clauses naming supporting evidence identifiers.

Unknown references, forbidden claim categories, unsupported assertions, altered verbatim values, unresolved material conflicts, schema deviations, placeholders, prohibited first-person usage, duplicate sentences, or unallowlisted spelling and grammar findings MUST reject the candidate. The exact model provider and model MAY vary as a reversible dependency only if these contracts, privacy constraints, pinned version recording, and acceptance results remain unchanged.

## 5. Publication and recovery

### PUB-001 — Platform and trust boundary

The implementation MUST use Vercel Pro for the Next.js public Portfolio and private uploader/API, Neon PostgreSQL through Vercel Marketplace for authoritative transactional state, private Vercel Blob for transient uploads and immutable candidate packages, Vercel Sandbox for parsing, GitHub Actions for GitHub collection, and Resend for actionable email.

Career and GitHub snapshots, project state, evidence graph, generated-copy provenance, Publication manifests, run state, diagnostics, and audits MUST remain private. Only the allowlisted Public projection and public manifest hash may enter deployments. OAuth, database, Blob, Vercel, model, and Resend credentials MUST never enter public bundles. Environments and credentials MUST be separated and least-privileged.

### PUB-002 — Publication manifest and state machine

Every Publication run MUST serialize work against exact immutable Career and GitHub snapshot IDs; Presentation-policy version; code commit; schema, parser, generator and prompt versions; Approved-renderer commit; checker versions and configurations; prior selection state; and candidate hash.

Runs MUST advance through leased, restartable steps: ingest, normalize, reconcile, select, generate, render, validate, deploy preview, validate preview, promote, verify production, finalize. Each transition MUST use an idempotency key plus compare-and-swap or row locking and MUST checkpoint output within Vercel Function limits. Scheduled runs for superseded GitHub inputs MAY coalesce; a new upload MUST NOT mutate an in-flight run.

The Publication manifest MUST bind the candidate to all pinned inputs, every rendered field and generated clause, transformations, evidence references, validation outcomes, public-output hash, deployment, and recovery relationship. PostgreSQL is the sole authority for orchestration, leases, Last-valid state, breaker state, outbox, and notification ledger. A beta queue MAY accelerate delivery but MUST NOT be authoritative.

### PUB-003 — Immutable preview and promotion

Validated candidates MUST be stored as hashed immutable packages in private Blob with manifests in PostgreSQL. Vercel MUST build a pinned Git commit using a short-lived candidate-scoped credential that retrieves exactly one package. The build MUST emit only allowlisted public fields and the public manifest hash.

Each candidate MUST receive a unique zero-traffic deployment. The full candidate checks MUST pass and its manifest and public-output hashes MUST match before promotion. The exact checked deployment MUST be promoted without rebuilding. Three complete Production-check passes across 90 seconds are required before a transaction marks it Valid, advances the Last-valid pointer, finalizes the audit, and emits outbox intents.

### PUB-004 — Failure and recovery

A pre-promotion failure MUST reject the candidate, preserve valid Source snapshots and the Last valid portfolio, retain actionable diagnostics, delete transient raw data, and permit unrelated source collection. A failed source refresh MUST NOT poison another valid Source snapshot.

Wrong manifest or deployment hashes and confirmed critical-content mismatch are immediate production failures. Availability, asset, runtime, navigation, or accessibility-smoke failures MUST trigger recovery only after three independent failed probes across two minutes. Performance variation and third-party-link availability MUST NOT trigger rollback.

On objective production failure, the system MUST make one idempotent attempt to route production to the recorded preceding Valid deployment, verify its hash and Production checks, quarantine the rejected deployment, open the Publication circuit breaker, and notify Michael. It MUST NOT rebuild during rollback, oscillate, automatically retry promotion, or re-promote a Quarantined deployment unchanged. If rollback or verification fails, the breaker MUST remain open and notification MUST escalate.

While the breaker is open, source collection MAY continue but promotion MUST stop. It may clear only after the currently served Valid deployment passes recovery checks. The private interface MUST expose run, deployment, check, served-version, breaker, outbox, deletion, and notification state and MUST permit retry of correctable work and manual restoration of retained Valid deployments.

### PUB-005 — Outbox, retention, and notification

Every cross-service effect—raw deletion, deployment creation, promotion, rollback, cleanup, and notification—MUST originate as a transactional outbox intent. Workers MUST use provider idempotency where available and reconcile ambiguous timeouts by reading provider state before retry.

Retain the latest 20 Valid deployments and the Career snapshots, manifests, hashes, check outcomes, and reproducibility data required to restore them. Retain compact run and audit records for one year. Retain bulky reports and screenshots for rejected and Quarantined deployments for 30 days. Configure Neon point-in-time recovery; database recovery MUST NOT replace immutable deployment retention.

Resend notification MUST be idempotent and limited to terminal publication failure, automatic rollback, rollback failure, stuck raw deletion or outbox reconciliation, missed daily GitHub collection, and security-relevant upload or authentication rejection. Routine success MUST remain visible privately without email.

## 6. Publication quality gates

### QAL-001 — Identity, provenance, completeness, and privacy

Every rendered factual field and generated factual clause MUST resolve to an immutable Source-snapshot field or explicit Presentation-policy value. Unknown evidence, unsupported or orphan facts, altered verbatim values, source-authority violations, material conflicts, or manifest/render mismatch MUST reject the candidate.

Section inventory, entity counts, source order, and verbatim values MUST match the manifest, including all career roles and bullets, selected projects and matched bullets, complete on-page résumé material, Email/GitHub/LinkedIn links, and Public résumé HTML and PDF.

An independent scan MUST cover emitted HTML, JSON, scripts, source maps, headers, PDFs, images and metadata, and downloads. It MUST reject raw-upload content or metadata beyond the Public projection, phone numbers, street addresses, credentials, tokens, private-service URLs, private evidence IDs, source-map source content, or unallowlisted contact data. Public output MUST show a discreet last-updated timestamp and public manifest hash but MUST NOT expose internal provenance or diagnostics.

### QAL-002 — Accessibility and responsive behavior

The Approved renderer MUST conform to WCAG 2.2 AA. Normal text contrast MUST be at least 4.5:1; large text, required UI, and graphics at least 3:1. It MUST have correct landmarks, headings, sequence, alternatives, labels, link purpose, keyboard operation without traps, visible unobscured focus, and no color-only information.

Pinned automated checks MUST report zero violations on every public HTML surface and supported viewport. The renderer MUST support 200% zoom, WCAG text-spacing overrides, 320-CSS-pixel reflow without two-dimensional scrolling, forced colors, and reduced motion without clipped, overlapping, hidden, unreadable, or unreachable content. Discrete controls and navigation links MUST expose at least 44×44 CSS-pixel targets; inline prose links are exempt when clearly distinguishable with adequate spacing.

Current Chromium, Firefox, and WebKit MUST be exercised at 320×568, 390×844, 768×1024, 1440×900, and 1920×1080. Horizontal overflow, overlap, clipping, unusable navigation, broken Card-to-editorial flow, or layout instability is blocking. Expected content wrapping is not. Manual baseline approval MUST cover keyboard, VoiceOver/Safari, NVDA/Chrome, sparse and dense content, long words, zoom, forced colors, and reduced motion.

Deterministic section, reading-order, geometry, overflow, and immutable-chrome invariants MUST be compared with the Approved-renderer baseline. Expected height and wrapping changes from valid source content are non-blocking; unexpected changes to immutable UI chrome are blocking.

### QAL-003 — Performance

Three cold mobile Lighthouse runs in a pinned environment MUST produce a median Performance score of at least 90; median FCP ≤1.8 s, Speed Index ≤3.4 s, LCP ≤2.5 s, TBT ≤200 ms, and CLS ≤0.1. No run may score below 85 or enter the pinned Lighthouse poor band for a gated metric. Compressed initial JavaScript MUST be ≤150 KiB and total compressed initial transfer ≤500 KiB.

Against the Last-valid Quality baseline in identical conditions, reject only when median LCP, median TBT, or total initial transfer worsens by more than 10% **and** by more than 100 ms for timing or 25 KiB for transfer. Field p75 objectives are LCP ≤2.5 s, INP ≤200 ms, and CLS ≤0.1; absent or poor field data is a warning, never a promotion or rollback gate.

### QAL-004 — SEO, links, and assets

The production-shaped preview MUST be indexable, successful, and free of accidental `noindex`, crawler blocks, inaccessible critical resources, or conflicting canonicals. It MUST contain one descriptive title, accurate meta description, one unambiguous `h1`, absolute self-canonical, valid `robots.txt` and sitemap, descriptive crawlable anchors, complete Open Graph metadata and image, no duplicate IDs, and valid allowlisted `Person`/`ProfilePage` structured data.

Every internal path, résumé action, asset, and candidate-introduced link MUST resolve with expected status, host, content type, and pinned hash where applicable. Internal links MUST NOT redirect. External links MUST attempt `HEAD` first and a bounded `GET` when unsupported. External HTTPS links may follow at most three redirects and MUST reject malformed chains, HTTPS downgrade, unexpected final domains or repository identities, and two confirmed `404` or `410` results across retries. After three attempts within two minutes, timeouts, `401`/`403` bot barriers, `429`, and `5xx` are Quality warnings. `mailto:` MUST be checked locally against the allowlisted address without sending mail.

### QAL-005 — Public résumé artifacts

The Public résumé HTML MUST pass all HTML gates. Its PDF MUST have selectable text, document title and language, structural tags, logical reading and tab order, correct headings and lists, meaningful link annotations, embedded fonts, no clipped or missing content, and zero failures from the pinned PDF/UA validator. Extracted visible content and order MUST exactly match the Career snapshot and manifest.

### QAL-006 — Checker integrity and evidence

Every blocking checker MUST pin version, rules, environment, and configuration. An execution failure MAY retry twice in a clean environment. Missing, timed-out, crashed, or contradictory required results MUST fail closed. Prior green results MUST NOT be reused and blocking failures MUST NOT be waived.

Acceptance evidence MUST record checker identity, version, configuration hash, target, start and finish, outcome, measurements, retry history, and report or artifact pointer. Subjective aesthetics, expected content-driven screenshot differences, field performance, and transient third-party availability are observable Quality warnings, not blocking results.

## 7. Human gates and completion

### OPS-001 — Permitted human involvement

Human gates are limited to account and credential provisioning, approval of the initial or materially changed Approved renderer, and exceptional recovery choices. Routine source updates and evidence-valid generated copy MUST NOT require editorial approval. A human MAY repair check infrastructure and rerun the same immutable candidate but MUST NOT waive failure into production.

### OPS-002 — Ticket closure

An implementation ticket may close only when every stated acceptance check passes in its pinned environment; reproducible evidence is linked; traceability and operational documentation are current; Last-valid behavior is preserved where applicable; and no unresolved placeholder, waived blocking check, or undocumented manual step remains. Merge, code completion, or a first successful deployment alone is insufficient.

### OPS-003 — Implementation completion

The implementation is complete only after all services are provisioned; real Career and GitHub inputs have been ingested; the initial Approved renderer and Quality baseline exist; an immutable real candidate has passed the ordinary preview, promotion, and production-verification path; daily and manual synchronization are active; controlled pre-promotion and post-promotion failures prove preservation and restoration of the Last valid portfolio; deletion, notification, retention, audit, breaker, retry, and restore behavior have been exercised; and the operating package has been handed over. The first production release MUST NOT use a one-off bypass.

## 8. Handoff completeness

### HOF-001 — Required package

This specification is accompanied by [dependency-linked implementation tickets](issues/), [bidirectional traceability](traceability.md), [versioned fixtures and expected outcomes](fixtures/catalog.md), [a threat and failure model](threat-model.md), and [operational runbooks](runbooks/README.md).

### HOF-002 — Exit audit

Before implementation begins, every resolved Wayfinder decision MUST be represented here; every normative requirement MUST map to at least one ordered ticket and objective acceptance check; every ticket MUST trace only to supported requirements; every dependency MUST be explicit; and every human-owned provisioning step MUST have a checklist. There MUST be no orphan requirement or unsupported ticket.
