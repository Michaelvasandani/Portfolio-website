# Agentic Portfolio — Implementation Handoff

This directory is the implementation-planning package produced from the completed [Wayfinder decision map](../agentic-portfolio/map.md).

## Authority

- [Implementation specification](spec.md) — normative product, data, trust, publication, quality, and completion requirements.
- [Traceability matrix](traceability.md) — requirements to decisions, tickets, and acceptance evidence in both directions.
- [Implementation tickets](issues/) — eleven dependency-linked executable slices.
- [Fixture catalogue](fixtures/catalog.md) — versioned representative and adversarial scenarios with expected outcomes.
- [Threat and failure model](threat-model.md) — assets, boundaries, threats, failure convergence, and residual risk.
- [Operational runbooks](runbooks/README.md) — human-owned and operational checklists.
- [`audit-handoff.sh`](audit-handoff.sh) — package-integrity audit.

If artifacts disagree, follow the precedence in [the specification](spec.md#1-purpose-and-authority).

## Starting implementation

Begin with [Establish foundations and executable contracts](issues/01-establish-foundations-and-executable-contracts.md). After it closes, [Provision the managed control plane](issues/02-provision-the-managed-control-plane.md) requires Michael, while [Establish the Approved renderer](issues/03-establish-the-approved-renderer.md) may advance in parallel until its human approval checkpoint.

Run the planning audit with:

```bash
bash .scratch/agentic-portfolio-implementation/audit-handoff.sh
```

Passing this planning audit means the handoff is internally complete. It does not mean the Portfolio has been constructed or qualified in production.
