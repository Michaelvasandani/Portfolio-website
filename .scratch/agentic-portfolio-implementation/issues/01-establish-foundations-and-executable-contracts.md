# Establish foundations and executable contracts

Status: complete
Blocked by: none

Closure evidence: [`../../../evidence/ticket-01.md`](../../../evidence/ticket-01.md)

## Outcome

A pinned, runnable Next.js repository foundation expresses the Portfolio's domain schemas, state transitions, trust-boundary rules, and fixture contracts so later capability slices can build against stable executable interfaces.

## Included

- Pin runtime, package manager, dependencies, linting, type checking, unit/integration test framework, browser-test tooling, migrations, and environment validation.
- Encode versioned contracts for Career and GitHub snapshots, Presentation policy, project-selection state, evidence packets, generated output, Publication manifests, Publication runs, deployments, checks, outbox records, breaker state, and audits.
- Encode the allowed Publication-run and deployment transitions and reject illegal transitions.
- Encode source-authority, Display-normalization, Public-projection, evidence-reference, versioning, hash, and idempotency invariants.
- Turn [the fixture catalogue](../fixtures/catalog.md) into versioned machine-readable fixtures and contract tests.

## Excluded

- Managed-service provisioning, user-facing rendering, source collection, generation, deployment, and production operation.

## Acceptance checks

- A clean checkout installs reproducibly and passes pinned lint, type, unit, schema, migration, and contract-test commands.
- Every required contract rejects unknown schema versions, missing immutable IDs or hashes, illegal state transitions, private fields in Public projection, and evidence references outside the pinned inputs.
- Every catalogue fixture has a stable ID/version, machine-readable input, expected outcome, and passing executable assertion.
- Local test configuration uses no production credential and fails startup when required environment contracts are absent or malformed.

## Acceptance evidence

Record lockfile/tool versions, command output, schema and migration version hashes, state-transition test report, fixture result matrix, and environment-validation report.

## Failure and recovery

A failed migration or contract check leaves the prior schema usable and blocks dependent tickets. No compatibility shim may weaken source authority, privacy, evidence binding, or state invariants.

## Requirements

PRD-001, PRD-003, SRC-001, CAR-002, GIT-002, GEN-001, PUB-002, QAL-001, QAL-006, OPS-002, HOF-001
