# Make publication checks executable

Status: ready-for-human
Blocked by: 03 (Establish the Approved renderer), 07 (Compose evidence-bound candidates)

## Outcome

Every blocking Publication check and non-blocking Quality warning runs reproducibly against a candidate and immutable preview, fails closed when its own integrity is uncertain, and emits retained acceptance evidence.

## Included

- Implement candidate identity, manifest/hash, provenance, completeness, Public-projection, privacy-leak, generated-copy, accessibility, responsive, performance, SEO, structured-data, link, asset, Public résumé, PDF/UA, and checker-integrity checks.
- Pin checker versions, rules, environments, configurations, browsers, viewports, retry policy, Lighthouse conditions, regression tolerances, and evidence schema.
- Classify subjective visuals, content-driven screenshots, field performance, and transient third-party failures as warnings while keeping objective failures blocking.
- Run the full suite against a production-shaped, zero-traffic immutable deployment.

## Excluded

- Promotion, rollback, human waiver, subjective generated-copy approval, or reuse of earlier green results.

## Acceptance checks

- Every QAL requirement has a positive and negative fixture producing the specified pass, warning, or blocking result.
- Browser, viewport, zoom, text-spacing, forced-colors, reduced-motion, target-size, Lighthouse, transfer, regression, SEO, link-retry, asset-hash, PDF/UA, content-order, and leak thresholds exactly match the specification.
- A crashed, timed-out, missing, stale, or contradictory checker retries at most twice cleanly and then fails closed.
- Identical immutable inputs reproduce check identities and essential measurements; evidence records all mandated metadata and retention class.
- The suite rejects preview/manifest or public-output mismatch and cannot be configured to bypass a failure without changing the normative pinned configuration hash.

## Acceptance evidence

Link the requirement/check inventory, positive-negative fixture matrix, pinned environment manifest, all generated reports, retry/fail-closed demonstrations, warning classification examples, and evidence-retention manifest.

## Failure and recovery

A missing or invalid blocking result rejects the candidate and leaves the Last valid portfolio live. Repair permits rerunning the same immutable candidate; it does not convert failure to pass.

## Requirements

PRD-003, CNT-001, CNT-002, CNT-003, GEN-001, PUB-003, QAL-001, QAL-002, QAL-003, QAL-004, QAL-005, QAL-006, OPS-002
