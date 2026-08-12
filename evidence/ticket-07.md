# Ticket 07 — candidate composition evidence

Status: local/application capability complete; ticket remains open pending a compliant live generation provider and managed acceptance run.

## Executable evidence

- `pnpm exec vitest run src/composition/selection.test.ts src/composition/generator.test.ts src/composition/compose.test.ts`
  - eligibility and evidence-class gates;
  - score breakdowns, initial ties, pin precedence, target-five behavior, all-six-pin behavior, and fewer-than-five behavior;
  - diversity selection inside the eight-point band;
  - direct URL, corroborated alias, and ambiguous résumé matching;
  - two-consecutive-run replacement and recency-only ordering stability;
  - strict generation schema, word/voice/grammar/placeholder/forbidden-claim checks, unknown-reference rejection, and adversarial evidence handling;
  - complete Public projection and Public résumé HTML/PDF input equality;
  - source-conflict and failed-generator rejection with immutable input/prior-state preservation;
  - field/clause evidence traversal, privacy scan, and repeated-run hash determinism.
- `pnpm exec tsx scripts/composition/verify.ts`
  - emits the deterministic local fixture matrix, score breakdowns, matching decisions, stability history, completeness report, and semantic/rendered/candidate/public-manifest hashes.
- `pnpm exec tsx scripts/composition/verify.ts --evidence`
  - reproduces `evidence/ticket-07/local-fixture-results.json` byte-for-byte when redirected with the final newline preserved.

## Deterministic fixture result

See [ticket-07/local-fixture-results.json](ticket-07/local-fixture-results.json). Repeated runs produced identical hashes while the semantic-source and rendered-content hashes remained distinct.

## Production boundary

`productionGenerator()` fails closed unless it receives an explicitly configured provider with a pinned version, disabled training, zero retention, and matching provider/model identity in strict structured output. No live provider, model version, zero-retention evidence, or managed environment identity is available in this workspace, so production/model acceptance is intentionally not claimed and this ticket remains open.
