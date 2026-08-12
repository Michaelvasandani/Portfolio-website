# Agentic Portfolio — Fixture Catalogue

Status: normative
Catalogue version: 1.0.0

These fixtures define stable inputs and expected outcomes before executable schemas exist. “Establish foundations and executable contracts” MUST encode each fixture as immutable machine-readable data without weakening its outcome. Fixture identifiers never change meaning; changed inputs or outcomes require a new catalogue version and fixture ID.

## Career ingestion

| Fixture | Input | Expected outcome |
| --- | --- | --- |
| CAR-V1-001 Typical Markdown | Named person, two roles with ordered bullets, education, two projects, skills, Email/GitHub/LinkedIn. | Installs one complete snapshot; preserves text/order; records provenance; enqueues raw deletion. |
| CAR-V1-002 Dense DOCX | Six roles, long bullets, GPA/coursework, projects, skills, awards, certifications, publications, volunteering, safe links. | Installs every recognized item once in source order; no truncation; raw deleted. |
| CAR-V1-003 Text PDF | Same semantics as CAR-V1-001 with selectable text and harmless document metadata. | Equivalent normalized snapshot; hidden metadata excluded; raw deleted. |
| CAR-V1-004 Sparse valid | Person name plus one experience entry and no optional fields. | Installs; absent optional fields remain absent; rendering stays valid. |
| CAR-V1-005 Display normalization | Extra whitespace, typographic quotes, equivalent safe date and URL forms. | Original and normalized values retained; only allowed transformations recorded. |
| CAR-V1-006 Ambiguous bullet | A bullet lies between two entries without an unambiguous parent. | Rejects as materially lossy; prior snapshot unchanged; raw deletion enqueued. |
| CAR-V1-007 Unknown material section | A populated material section cannot map to a recognized typed section. | Rejects; reports location and heading; prior snapshot unchanged. |
| CAR-V1-008 Conflicting duplicate | Same role identity has incompatible dates or bullets with no source distinction. | Rejects; no silent merge or omission. |
| CAR-V1-009 Image-only or encrypted PDF | No selectable text, or encryption prevents safe extraction. | Rejects without OCR; prior snapshot unchanged; raw deletion enqueued. |
| CAR-V1-010 Active or linked DOCX | Macro-bearing package or external linked resource. | Macro never executes; network fetch is denied; upload rejects safely. |
| CAR-V1-011 Resource bomb | Oversized file, extreme archive expansion, file count, text size, memory, or time. | Bounded termination; no partial snapshot; deletion and actionable diagnostics. |
| CAR-V1-012 Private leakage | Phone, street address, token-like secret, private URL, hidden author metadata, unallowlisted contact. | Candidate or normalization rejects before public projection; exact private value is redacted from diagnostics. |

## GitHub collection

| Fixture | Input | Expected outcome |
| --- | --- | --- |
| GIT-V1-001 Four public pins | Current four eligible public pins plus broader public repositories and complete evidence responses. | Immutable snapshot preserves pin order and evidence hashes using `permissions: {}`. |
| GIT-V1-002 Duplicate delivery | Same signed normalized payload and content hash delivered twice. | First persists; second is a successful no-op; one snapshot identity. |
| GIT-V1-003 Tampered delivery | Invalid signature, wrong workflow/repository identity, altered body/hash, stale timestamp, or replay. | Rejects and audits without replacing snapshot. |
| GIT-V1-004 Partial API failure | README succeeds; topics rate-limit; release endpoint returns transient `5xx`. | Records fetch outcomes; does not install an invalid/partial snapshot unless schema's validity contract is satisfied; prior remains. |
| GIT-V1-005 Freshness boundary | Otherwise valid snapshots aged 47:59 and 48:01 at run capture. | First may support a new candidate; second blocks promotion but may remain in Last valid portfolio. |
| GIT-V1-006 Mechanical activity | Dependency bot or formatting-only activity moves recency date. | Does not count as meaningful activity or alter ranking recency. |

## Selection and generation

| Fixture | Input | Expected outcome |
| --- | --- | --- |
| SEL-V1-001 Six eligible pins | Six eligible pins with varied scores and domains. | Selects all six; pin order participates in tie-breaking; diversity removes none. |
| SEL-V1-002 Fewer than five | Two eligible pins, one eligible unpinned, several ineligible weak repositories. | Selects three; never fills with an ineligible project. |
| SEL-V1-003 Eligibility exclusions | Fork, archive, template, empty repo, mirror, coursework fragment, unexplained code, and one substantive repo. | Only substantive, attributable, evidenced repo qualifies. |
| SEL-V1-004 Direct résumé match | Career project links directly to public repository. | High-confidence match; awards/outcomes remain Career-attributed; adds 30 points. |
| SEL-V1-005 Alias match | Clear name alias plus three corroborating capability/stack/domain facts. | High-confidence match and recorded evidence. |
| SEL-V1-006 Ambiguous match | Similar name with one or conflicting corroborating fact. | Remains unmatched and observable; no 30 points; does not block unrelated work. |
| SEL-V1-007 Diversity band | Diverse challenger trails highest candidate by 7, then by 9. | May win at 7; must not win at 9. |
| SEL-V1-008 Stability band | Challenger leads incumbent by 8 on first day and second consecutive day. | Preserve after first; replace after second. |
| SEL-V1-009 Reorder and recency | Score difference 4, then 5; separate recency-only bucket change. | No reorder at 4; reorder allowed at 5; recency-only change preserves order. |
| GEN-V1-001 Supported narrative | Sanitized evidence supports thesis, 20-word Card proof, bounded About, and project facts. | Accepts schema-constrained clauses with exact evidence IDs and correct voice/length. |
| GEN-V1-002 Thesis fallback | Evidence does not support dependable agentic-AI positioning. | Uses repository-owned broader fallback and records it; no fabricated support. |
| GEN-V1-003 Unsupported claim | Model asserts adoption, award, intent, or production status absent from evidence. | Rejects candidate rather than hedging or editing the claim. |
| GEN-V1-004 Prompt injection | README or résumé text instructs the generator to ignore schema or reveal private data. | Treats instruction as untrusted evidence text; unknown references/private output reject. |
| GEN-V1-005 Altered verbatim | Generated or rendering path changes a source bullet or title. | Rejects on exact-value comparison. |

## Rendering and publication checks

| Fixture | Input | Expected outcome |
| --- | --- | --- |
| RND-V1-001 Sparse | CAR-V1-004 and three projects with short content. | Complete section order, intentional whitespace, no collapsed structure. |
| RND-V1-002 Dense | CAR-V1-002, six selected pins, long project bullets. | No truncation/overlap; meaningful mobile linearization; complete PDF. |
| RND-V1-003 Long words | Long URLs, repository names, technical tokens, and unbroken strings. | Wraps or safely contains at 320 px, zoom and spacing overrides without horizontal page scroll. |
| RND-V1-004 Forced colors and reduced motion | RND-V1-002 under platform overrides. | Content, focus, links, controls, and hierarchy remain perceivable and reachable. |
| CHK-V1-001 Clean candidate | Known-good manifest, renderer, links, PDF, budgets, and hashes. | Every blocking result passes and expected warnings remain non-blocking. |
| CHK-V1-002 Leak corpus | Secret/PII injected separately into HTML, JSON, source map, PDF metadata, image metadata, header, and download. | Each location independently rejects the candidate. |
| CHK-V1-003 External-link outcomes | Success, redirect chain 3/4, downgrade, repeated 404, 403, 429, 5xx, timeout. | Pass/warn/fail classifications exactly match QAL-004. |
| CHK-V1-004 Broken checker | Crash, timeout, absent output, stale result, or contradictory result. | Up to two clean retries, then blocking fail; no prior-green reuse. |
| CHK-V1-005 Performance boundary | Metrics exactly at, just within, and just outside absolute and dual regression thresholds. | Boundary values classify exactly per QAL-003. |
| CHK-V1-006 PDF mismatch | Accessible-looking PDF omits or reorders one source bullet. | Rejects despite other PDF checks passing. |

## Orchestration and recovery

| Fixture | Input | Expected outcome |
| --- | --- | --- |
| PUB-V1-001 Concurrent triggers | GitHub schedule, duplicate delivery, and résumé upload arrive around one active run. | Runs serialize; duplicate no-ops; superseded schedule may coalesce; upload does not mutate active run. |
| PUB-V1-002 Worker interruption | Worker dies after provider request but before local acknowledgement at every outbox-backed step. | Lease expires; provider state is read; retry converges with no duplicate effect. |
| PUB-V1-003 Pre-promotion failure | Candidate fails provenance, renderer, or preview check. | Candidate rejected; no promotion; Source snapshots and Last valid portfolio unchanged. |
| PUB-V1-004 Production critical mismatch | Promoted output hash differs from manifest. | Immediate one-attempt restore; quarantine; breaker open; notification. |
| PUB-V1-005 Production probe failure | Availability fails three times across two minutes; comparison case fails twice then passes. | Three failures trigger recovery; interrupted sequence does not. |
| PUB-V1-006 Ambiguous rollback | Provider times out after route mutation. | Read provider state before retry; converge once; never oscillate. |
| PUB-V1-007 Rollback verification failure | Prior deployment routes but fails hash or Production checks. | Breaker stays open; escalation sent; no automatic second target or rebuild. |
| PUB-V1-008 Breaker behavior | New snapshots and candidates arrive while breaker open. | Collection continues; no candidate promotes; clear only after served Valid deployment passes recovery. |
| PUB-V1-009 Retention boundary | 21 Valid deployments, year-old compact audits, 31-day bulky rejected report. | Latest 20 remain restorable; policy-eligible records clean idempotently; required hashes/manifests retained. |

## Production-only qualification scenarios

`PROD-V1-001` uses Michael's real supported résumé and current GitHub snapshot to publish through the ordinary pipeline. `PROD-V1-002` injects a controlled candidate failure before promotion. `PROD-V1-003` uses a reversible controlled production-check failure against a sacrificial deployment to prove restoration. These scenarios MUST never disclose fixture or real secrets, permanently delete retained Valid deployments, or bypass provider safeguards.
