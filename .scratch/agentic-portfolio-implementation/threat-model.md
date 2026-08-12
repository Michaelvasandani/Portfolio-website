# Agentic Portfolio — Threat and Failure Model

Status: normative supporting model
Version: 1.0.0

## Assets

- Raw Résumé uploads and their metadata
- Career and GitHub Source snapshots
- OAuth identity and sessions
- Provider credentials and private service endpoints
- Evidence graph, Publication manifests, run/audit state, and diagnostics
- Immutable candidate packages and Valid deployments
- Production routing, Last-valid pointer, quarantine, and breaker state
- Michael's public identity, contact data, and professional claims

## Actors

- Michael, the sole authorized private user
- An unauthenticated visitor
- A valid but unauthorized GitHub user
- Untrusted résumé and repository content authors
- A compromised browser, dependency, worker, provider credential, or third-party service
- Provider and network systems capable of loss, duplication, delay, partial failure, and ambiguous timeouts

## Trust boundaries

1. Public browser ↔ public immutable deployment
2. Michael's browser ↔ authenticated private Next.js control plane
3. Private control plane ↔ Vercel Sandbox parser
4. GitHub Actions ↔ signed private ingestion endpoint
5. Control plane ↔ model provider using sanitized evidence only
6. PostgreSQL transaction ↔ Blob, Vercel, and Resend side effects through the outbox
7. Zero-traffic preview ↔ production routing
8. Private canonical state ↔ allowlisted Public projection

## Threats and required controls

| Threat | Required controls | Verification | Owner ticket |
| --- | --- | --- | --- |
| Unauthorized private access | GitHub App state validation, immutable numeric-ID allowlist, secure short sessions, CSRF protection, deny/audit all others. | OAuth/session negative matrix. | [Owner access](issues/04-establish-owner-access-and-the-operational-shell.md) |
| Credential or private-state disclosure | Environment separation, least privilege, server-only access, private storage, redacted logs, public-bundle and emitted-asset scanning. | Access probes and exhaustive leak corpus. | [Provisioning](issues/02-provision-the-managed-control-plane.md), [Publication checks](issues/08-make-publication-checks-executable.md) |
| Malicious résumé/parser exploit | Signature/type verification, size and expansion bounds, pinned network-disabled Sandbox, no macros/OCR/linked resources, raw deletion. | Adversarial parser fixtures. | [Career ingestion](issues/05-ingest-and-replace-career-evidence-safely.md) |
| Prompt injection or fabricated claims | Raw uploads never reach model; evidence is untrusted data; schema-constrained output; exact evidence IDs; deterministic forbidden-claim and verbatim checks. | Injection, unknown-reference and unsupported-claim fixtures. | [Candidate composition](issues/07-compose-evidence-bound-candidates.md) |
| GitHub payload forgery or replay | Signed content-addressed delivery, repository/workflow identity, schema, timestamp window, hash and size verification, idempotent duplicate handling. | Tamper/replay fixture matrix. | [GitHub collection](issues/06-collect-immutable-github-evidence.md) |
| Source-authority confusion | Field-level authority matrix, immutable provenance, material-conflict rejection, no silent rewrite. | Conflict and evidence-traversal tests. | [Foundations](issues/01-establish-foundations-and-executable-contracts.md), [Candidate composition](issues/07-compose-evidence-bound-candidates.md) |
| PII or secret publication | Field allowlist plus independent scans of HTML, JSON, scripts, maps, headers, PDF, image metadata, and downloads. | CHK-V1-002. | [Publication checks](issues/08-make-publication-checks-executable.md) |
| Lost or duplicated provider effect | Transactional outbox, idempotency keys, leased steps, provider-state reconciliation before retry. | Crash and ambiguous-timeout injection at each effect. | [Autonomous publication](issues/09-publish-immutable-candidates-autonomously.md), [Recovery](issues/10-prove-recovery-and-continued-operation.md) |
| Unchecked or different deployment promoted | Immutable package, pinned commit, scoped build credential, zero-traffic deployment, manifest/public hash verification, exact deployment promotion. | Package-to-production hash chain. | [Autonomous publication](issues/09-publish-immutable-candidates-autonomously.md) |
| Broken checker falsely passes | Pinned checker identity/configuration, clean retries, fail closed on missing or contradictory results, no waiver or prior-green reuse. | Checker-failure fixtures. | [Publication checks](issues/08-make-publication-checks-executable.md) |
| Failed production oscillates or worsens | Objective-only triggers, one idempotent prior-Valid restore, provider-state reconciliation, verification, quarantine, breaker, no rebuild or unchanged re-promotion. | Controlled recovery scenarios. | [Recovery](issues/10-prove-recovery-and-continued-operation.md) |
| Destructive or premature retention | Latest-20 restore set, one-year compact audit, 30-day bulky diagnostics, dry-run selection, idempotent cleanup, PITR. | Boundary fixture plus restore exercise. | [Recovery](issues/10-prove-recovery-and-continued-operation.md) |
| Supply-chain or renderer drift | Lockfiles, pinned parser/checker/browser versions, dependency review, Approved-renderer invalidation on material changes. | Reproducible build and baseline invalidation test. | [Foundations](issues/01-establish-foundations-and-executable-contracts.md), [Approved renderer](issues/03-establish-the-approved-renderer.md) |

## Failure model

| Failure | Required state after convergence | Forbidden outcome |
| --- | --- | --- |
| Invalid Résumé upload | Prior Career snapshot and Last valid portfolio remain; raw deletion reconciles; private diagnostic exists. | Partial replacement, retained raw recovery copy, model exposure. |
| GitHub collection fails or becomes stale | Prior snapshot remains; no new promotion after 48 hours; collection failure observable. | Empty or partial snapshot replacing valid data. |
| Material source conflict | Candidate rejected; Source snapshots retained; conflict visible privately. | Silent source precedence, omission, or rewrite. |
| Generation or check fails | Immutable candidate rejected with evidence; Last valid portfolio unchanged. | Editorial waiver or prior-green reuse. |
| Worker dies or lease expires | Step resumes or terminalizes once with the same immutable inputs and no duplicate effect. | Mutating inputs or repeated provider side effects. |
| Provider returns ambiguous timeout | Read provider state, then complete or retry idempotently. | Blind retry that can duplicate promotion, deletion, or email. |
| Production objective check fails | Prior Valid deployment restored and verified once, failed deployment quarantined, breaker open, notification recorded. | Rebuild during rollback, oscillation, unchanged re-promotion. |
| Restore cannot be verified | Breaker remains open, observed production state recorded, escalation sent. | Claiming recovery or advancing Last valid. |
| Third-party link or field metric degrades | Quality warning retained; otherwise valid candidate remains eligible/served. | Automatic rollback for external/transient/observational failure. |
| Database recovery required | Restore transactional state through PITR, then reconcile actual provider state and immutable deployments. | Treating database restore alone as provider or deployment truth. |

## Residual risks

- Deterministic evidence checks reduce but cannot prove that every public claim conveys ideal human nuance; manual restore of an earlier Valid deployment remains available for technically valid but undesirable results.
- The system cannot reliably infer employer-confidential narrative from ordinary résumé prose; the uploader warning and Michael's source hygiene remain required.
- Provider-wide outages can delay collection, publication, notification, or recovery. Last-valid immutability and the circuit breaker limit change during outage but cannot guarantee provider availability.
- Manual accessibility approval establishes a renderer baseline, not universal accessibility proof. Automated checks and renderer reapproval reduce regression risk.
