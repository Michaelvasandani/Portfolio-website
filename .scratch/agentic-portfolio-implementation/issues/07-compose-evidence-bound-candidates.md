# Compose evidence-bound candidates

Status: ready-for-agent
Blocked by: 03 (Establish the Approved renderer), 05 (Ingest and replace career evidence safely), 06 (Collect immutable GitHub evidence)

## Outcome

Pinned Career and fresh GitHub snapshots deterministically produce a selection, evidence packet, bounded narrative, complete Public projection, résumé artifacts, and private Publication manifest with no unsupported fact.

## Included

- Reconcile source authority and material conflicts; match résumé projects to repositories.
- Enforce project eligibility, scoring, pin precedence, tie-breaking, diversity bands, stability thresholds, and prior-state persistence.
- Generate project sentences, Card proof, and About through the schema-constrained evidence contract; bypass the model for all verbatim content.
- Assemble every public section, Public résumé HTML/PDF inputs, metadata, links, last-updated value, and public manifest hash.
- Build the private manifest and clause/field-level evidence graph; distinguish semantic source hash from rendered-content hash.

## Excluded

- Source acquisition, renderer redesign, quality-check execution, preview deployment, promotion, or approval of generated copy.

## Acceptance checks

- Eligibility, scoring, matching, tie, diversity, pin, six-pin, fewer-than-five, and two-consecutive-run fixtures yield exactly the expected selection and order.
- Ambiguous matches remain observable and unscored; source conflicts reject only the candidate; failed model output preserves all Source snapshots and prior selection.
- Every generated clause resolves to supplied evidence and passes length, voice, schema, forbidden-claim, repetition, spelling, and grammar rules; adversarial evidence cannot alter instructions or references.
- Every role, bullet, education entry, skill group, optional section, selected project, matched project bullet, approved link, and résumé artifact input appears exactly once in required order.
- Public projection and independent leak scan contain no private-only field; manifest, evidence, candidate, and rendered-content hashes are deterministic across repeated runs.

## Acceptance evidence

Link selection fixture matrix, score breakdowns, matching decisions, stability run history, generation-contract and injection tests, completeness/provenance report, Public-projection diff, résumé content comparison, and determinism hashes.

## Failure and recovery

Any conflict, generation, schema, provenance, completeness, or privacy failure rejects the candidate and preserves Source snapshots, prior selection state, and the Last valid portfolio.

## Requirements

CNT-001, CNT-002, CNT-003, SRC-001, PRJ-001, PRJ-002, PRJ-003, PRJ-004, GEN-001, PUB-002, QAL-001, QAL-005, OPS-002
