# Choose portfolio-project evidence and ranking

Type: grilling
Status: resolved
Blocked by: 03 (Determine viable GitHub synchronization)

## Question

What evidence, eligibility rules, weighting, diversity constraints, and change thresholds should autonomously select and order Portfolio projects while treating pins and résumé projects as strong signals and excluding forks, archives, and context-poor experiments?

## Answer

Select every eligible GitHub pin, then add the highest-ranked eligible unpinned projects until the Portfolio contains five projects. Five is the target rather than a quota: publish however many qualify when fewer than five do, and publish all six when all six available pins qualify. Never fill the Portfolio with a weak experiment or remove an eligible pin merely to improve its score or diversity.

Pins are the strongest editorial signal and a high-confidence Résumé project match is the next strongest. Neither overrides the eligibility gate. A project mentioned in the résumé without a qualifying public repository may appear elsewhere as Career snapshot narrative, but it is not a Portfolio project.

### Evidence authority

GitHub owns repository identity, functionality, implementation, links, and activity. Inspect evidence in this order:

1. Repository metadata, preferred README, and topics.
2. Repository-owned project or architecture documentation.
3. Manifests, substantive source structure, tests, build configuration, and deployment metadata.
4. Releases and meaningful default-branch activity.

The Career snapshot may establish a repository match and supply clearly attributed project outcomes such as an award or adoption. It does not override contradictory GitHub facts. Generated claims must retain field-level provenance to the evidence that supports them.

A repository may qualify without a useful README when fallback evidence is sufficient. Evidence is sufficient when it establishes a coherent purpose and a substantive implementation using at least two corroborating evidence classes, or one repository evidence class plus a high-confidence Résumé project match. A file tree or dependency manifest alone is not enough.

### Eligibility

A candidate must be:

- publicly accessible;
- an original, substantive project rather than a fork, archive, disabled repository, empty repository, template-only scaffold, mirror, or context-poor experiment;
- attributable to Michael through ownership or explicit contribution evidence;
- supported by enough evidence to write a conservative one-sentence description without inference beyond the sources; and
- relevant enough to demonstrate AI, software, data, or adjacent engineering work to the Portfolio audience.

Reject repositories containing only coursework fragments, generated assets, configuration, an unimplemented idea, or unexplained source. Age alone never makes an otherwise strong project ineligible.

### Résumé matching

A direct repository URL in the Career snapshot is a high-confidence match. Otherwise, require a normalized name or clear alias plus at least two independent corroborating facts, such as the same primary capability, technology stack, external service, domain, or deployment URL. For example, `Voice-Agent` can match “Personal Call Agent” because the repository evidence independently confirms missed-call handling, Bland AI, and Google Calendar scheduling.

An ambiguous or conflicting candidate receives no Résumé points. Record the unresolved match for observability; do not guess or introduce an approval step.

### Descriptions

Every selected project receives one concise sentence covering the user problem, primary capability, and distinguishing technical evidence when those facts are available. For a project absent from the résumé, generate the sentence entirely from GitHub evidence. Do not invent impact, adoption, awards, production status, ownership, or technical behavior. Omit an unsupported clause rather than qualifying a guess.

Current evidence supports descriptions in this shape:

- **Clinical Trial Finder:** A conversational clinical-trial discovery system using FastAPI, BioBERT embeddings, PostgreSQL with pgvector, and Streamlit to search and match more than 26,000 ClinicalTrials.gov records.
- **ClosetOS:** A TypeScript daily-use wardrobe assistant with a command-line interface layered over a reusable core library.
- **Keeping-Up-AI:** A Python pipeline that gathers and curates AI engineering updates into a daily intelligence feed.
- **Voice Agent:** An AI voice assistant that handles missed calls, checks Google Calendar availability, books meetings, and sends verified post-call summaries through Bland AI and Resend.

These are generated examples, not repository-specific policy overrides; subsequent synchronization may revise them when their evidence changes.

### Ranking

Score every eligible project out of 100:

| Signal | Points | Rule |
| --- | ---: | --- |
| GitHub pin | 35 | All-or-nothing from the current pinned-items snapshot. |
| High-confidence Résumé match | 30 | All-or-nothing after the matching rule passes. |
| Evidence and technical substance | 20 | Up to 5 each for a clear purpose, substantive implementation, engineering proof such as tests/build/deployment, and specific traceable evidence. |
| Audience relevance | 10 | Strongest for applied AI/agent systems and software engineering; partial credit for broader data or adjacent engineering work. |
| Recency | 5 | 5 for meaningful activity within 90 days, 3 within one year, 1 within two years, otherwise 0. |

Stars, forks, watchers, and raw commit counts are displayable repository facts, not ranking signals. They are too dependent on audience size and repository age to serve as reliable evidence of portfolio quality. Automated or mechanical activity must not count as meaningful recency.

Selection is lexicographic before it is numeric: include all eligible pins first, regardless of score, then use score for unpinned additions and overall presentation order. On the first run, break an otherwise unresolved tie by evidence score, relevance score, GitHub pin position, then case-folded repository name. On later runs, preserve the prior selection and order inside the stability bands below.

### Diversity

Classify eligible projects by problem domain, product shape, and primary technical capability. When choosing an unpinned addition, prefer a candidate that adds diversity when it is within 8 points of the highest-scoring candidate. Within the selected set, diversity may reorder projects whose scores are within 5 points.

Diversity never removes an eligible pin, overrides the eligibility gate, or beats a candidate more than 8 points stronger. It should reveal range without hiding the strongest evidence.

### Change thresholds

Apply a selection change immediately when a project becomes eligible or ineligible, the pin set changes, or a high-confidence Résumé match is added or removed. These are material changes to editorial intent or evidence, not score noise.

For other changes:

- replace an unpinned incumbent only when an eligible challenger leads it by at least 8 points on two consecutive daily reconciliations;
- reorder existing projects only when their scores differ by at least 5 points;
- preserve the existing selection and order when a recency-bucket change is the only cause; and
- regenerate a project description only when its normalized supporting evidence changes semantically, then publish only when the rendered-content hash also changes.

Persist the prior selection, ordering, score components, evidence references, matching decision, and consecutive-run comparison so every autonomous change is reproducible. An ambiguous match remains observable and scores as unmatched without blocking other valid changes. A failed fetch, generation failure, or validation failure leaves the Last valid portfolio live.

### Expected current behavior

The current four pins—`clinical-trial-finder`, `ClosetOS`, `Keeping-Up-AI`, and `Voice-Agent`—are public, original, unarchived, and have enough direct or fallback evidence to qualify. Select all four. Score the eligible unpinned repositories normally to choose the fifth; the current strongest Résumé-backed candidates are `aitb-hackathon` for Hackathon-In-A-Box and `musa-labs` for SafeTrip SF. Do not hard-code either candidate or its current rank.
