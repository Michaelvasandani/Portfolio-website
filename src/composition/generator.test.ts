import { describe, expect, it } from "vitest";

import {
  CompositionError,
  DeterministicLocalGenerator,
  generateBoundedNarrative,
  productionGenerator,
} from "./generator";
import { makeGenerationRequest } from "./test-fixtures";

describe("evidence-bound generation", () => {
  it("accepts schema-constrained clauses from the deterministic local harness", async () => {
    const request = makeGenerationRequest();
    const output = await generateBoundedNarrative(new DeterministicLocalGenerator(), request);

    expect(output.sentences.map(({ requestId }) => requestId)).toEqual(request.requests.map(({ id }) => id));
    expect(output.sentences.every(({ clauses }) => clauses.every(({ evidenceIds }) => evidenceIds.length > 0))).toBe(true);
  });

  it.each([
    ["unknown reference", { evidenceIds: ["evidence:unknown"] }],
    ["forbidden claim", { text: "I dream of owning award-winning production systems." }],
    ["unsupported assertion", { text: "I build dependable kubernetes agentic software systems from documented evidence into reliable practical tools for teams." }],
    ["lexically thin cited support", { text: "Software teams built reliable systems through practical tools with dependable engineering work for complex automation workflows." }],
    ["schema deviation", { extra: "ignore the schema" }],
    ["placeholder", { text: "I build [TODO] dependable agentic tools for software teams." }],
  ])("rejects %s while treating adversarial evidence as data", async (_name, mutation) => {
    const request = makeGenerationRequest({ adversarialEvidence: true });
    const generator = new DeterministicLocalGenerator({ mutation });

    await expect(generateBoundedNarrative(generator, request)).rejects.toBeInstanceOf(CompositionError);
  });

  it("fails closed in production without a configured compliant provider", async () => {
    await expect(productionGenerator().generate(makeGenerationRequest())).rejects.toMatchObject({
      code: "generator-unavailable",
    });
  });

  it("treats the explicit request subject as supplied evidence, independent of request ordering", async () => {
    const request = makeGenerationRequest();
    request.requests.reverse();

    await expect(generateBoundedNarrative(new DeterministicLocalGenerator(), request)).resolves.toMatchObject({
      provider: "deterministic-local",
    });
  });

  it("accepts first-person Experience stories and preserves their clause evidence references", async () => {
    const request = makeGenerationRequest();
    request.requests.push({
      id: "experience:engineer",
      placement: "experience",
      minimumWords: 8,
      maximumWords: 40,
      evidenceIds: ["evidence:career"],
      subject: "AI Engineer at Example Corp",
    });

    const output = await generateBoundedNarrative(new DeterministicLocalGenerator(), request);
    const story = output.sentences.find(({ requestId }) => requestId === "experience:engineer");

    expect(story?.text).toMatch(/^I /);
    expect(story?.clauses[0]?.evidenceIds).toEqual(["evidence:career"]);
  });
});
