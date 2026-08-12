# Agentic Portfolio — Decision Map

Label: wayfinder:map

## Destination

An implementation-ready product, visual, content, and technical blueprint for a fully autonomous single-page portfolio, with an ordered backlog and no material decisions left for the builder to invent.

## Notes

- Audience: AI and software engineering hiring teams; the primary journey is to inspect selected work and then make contact.
- Operation: safe updates publish and deploy without routine approval, including generated narrative copy. Invalid updates leave the last valid portfolio live.
- Source authority: a sanitized Career snapshot derived from Michael's private Résumé upload owns experience and education; GitHub owns repository facts and project activity; repository policy controls eligibility and presentation.
- Content: the private uploader accepts Markdown, DOCX, and text-based PDF as complete career-history replacements. Email and professional links are public; phone number is not.
- Experience: one continuous page. The opening card view is terse; content becomes more verbose after the first scroll while retaining aesthetic integrity.
- Visual direction: an original, restrained homage to Patrick Bateman's business card—warm ivory, subtle texture, engraved-style typography, generous whitespace, and limited color—not a film-branded or exact reproduction.
- Freshness: daily synchronization plus a manually dispatchable run; no real-time requirement.
- LinkedIn boundary: LinkedIn is an outbound link only. Automated API workarounds, scraping, browser/computer-use observation, and persistent-session agents are prohibited.
- Upload privacy: GitHub OAuth restricts the private uploader to Michael's immutable account ID. Successful normalization deletes the raw file; only sanitized structured data, provenance, and deployment audit records remain.
- Every decision session must consult the `domain-modeling` skill and update `CONTEXT.md` when vocabulary crystallizes. Grilling tickets use `grilling`; prototypes use `prototype`; research uses primary sources via `research`.

## Decisions so far

<!-- Resolved ticket pointers are appended here; decision detail remains in its ticket. -->

- [Determine viable LinkedIn synchronization](issues/01-determine-viable-linkedin-synchronization.md) — Complete unattended career-history sync is unavailable through generally accessible LinkedIn products; scraping is prohibited and Plus is narrow partner-only enrichment.
- [Translate the business-card reference into an original visual system](issues/02-translate-the-business-card-reference.md) — Use warm paper, charcoal old-style serif, centered identity, peripheral metadata, subtle material depth, and whitespace within an original WCAG-conformant composition.
- [Determine viable GitHub synchronization](issues/03-determine-viable-github-synchronization.md) — Daily Actions reconciliation with GraphQL, REST, semantic hashes, manual dispatch, and artifact-based Pages deployment is viable; webhooks are only an accelerator.
- [Determine whether an agent may observe LinkedIn compliantly](issues/12-determine-compliant-agent-observation-of-linkedin.md) — Visual or computer-use agents remain prohibited automated access; compliant full-history inputs must be user-supplied or available through a geographically restricted portability API.
- [Choose the LinkedIn ingestion policy](issues/04-choose-the-linkedin-ingestion-policy.md) — Replace LinkedIn ingestion with a GitHub-authenticated private résumé upload that autonomously replaces career data, validates and deploys, deletes raw files, and preserves the last valid portfolio on failure.
- [Choose portfolio-project evidence and ranking](issues/05-choose-project-evidence-and-ranking.md) — Select every eligible GitHub pin, fill toward five with scored unpinned projects, generate provenance-bound descriptions, prefer close diverse candidates, and suppress non-material selection churn.

## Not yet specified

- The final implementation slices and sequencing depend on the visual prototype, publication architecture, and quality bar.

## Out of scope

- Building, deploying, or operating the website and synchronization pipeline; this effort ends at an implementation-ready blueprint.
- Real-time source propagation; daily freshness is sufficient.
- Publishing Michael's phone number.
- Exact reproduction of the film prop, American Psycho branding, or other theatrical imitation.
