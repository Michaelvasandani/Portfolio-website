import { generatorOutputSchema, generatorRequestSchema, type GeneratorOutput, type GeneratorRequest, type NarrativeGenerator } from "./contracts";

export class CompositionError extends Error {
  constructor(
    readonly code:
      | "generator-unavailable"
      | "generator-schema-invalid"
      | "generator-reference-invalid"
      | "generator-content-invalid",
    message: string,
  ) {
    super(message);
    this.name = "CompositionError";
  }
}

type LocalMutation = {
  text?: string;
  evidenceIds?: string[];
  extra?: string;
};

function locallyGroundedSentence(item: GeneratorRequest["requests"][number], suppliedText: string): string {
  const words = suppliedText.match(/[A-Za-z0-9+#-]+/g) ?? [];
  const prefix = item.placement === "experience"
    ? "I"
    : item.placement === "card"
    ? "I build dependable systems grounded in"
    : item.id === "about.lede"
      ? "I connect practical software engineering with"
      : item.placement === "about"
        ? "I have built documented software workflows grounded in"
        : `${item.subject.charAt(0).toLocaleUpperCase()}${item.subject.slice(1)} presents`;
  const available = Math.max(1, item.maximumWords - prefix.split(/\s+/).length);
  const desired = Math.min(available, Math.max(1, item.minimumWords - prefix.split(/\s+/).length + 3));
  const groundedWords = Array.from({ length: desired }, (_, index) => words[index % words.length] ?? item.subject);
  return `${prefix} ${groundedWords.join(" ")}.`;
}

export class DeterministicLocalGenerator implements NarrativeGenerator {
  constructor(private readonly options: { mutation?: LocalMutation } = {}) {}

  async generate(request: GeneratorRequest): Promise<unknown> {
    const output: Record<string, unknown> = {
      schemaVersion: 1,
      provider: "deterministic-local",
      model: "fixture-v1",
      sentences: request.requests.map((item, index) => {
        const suppliedText = request.evidence.filter(({ id }) => item.evidenceIds.includes(id)).map(({ text }) => text).join(" ");
        const groundedText = locallyGroundedSentence(item, suppliedText);
        const mutation = index === 0 ? this.options.mutation : undefined;
        const sentence = {
          requestId: item.id,
          text: mutation?.text ?? groundedText,
          clauses: [{ text: mutation?.text ?? groundedText, evidenceIds: mutation?.evidenceIds ?? item.evidenceIds }],
        } as Record<string, unknown>;
        if (mutation?.extra !== undefined) sentence.extra = mutation.extra;
        return sentence;
      }),
    };
    return output;
  }
}

class UnavailableProductionGenerator implements NarrativeGenerator {
  async generate(): Promise<never> {
    throw new CompositionError(
      "generator-unavailable",
      "No schema-constrained, zero-retention production narrative provider is configured.",
    );
  }
}

export type ProductionGeneratorConfiguration = {
  generator: NarrativeGenerator;
  provider: string;
  model: { name: string; pinnedVersion: string };
  trainingDisabled: true;
  retention: "zero";
};

class ConfiguredProductionGenerator implements NarrativeGenerator {
  constructor(private readonly configuration: ProductionGeneratorConfiguration) {}

  async generate(request: GeneratorRequest): Promise<unknown> {
    const output = await this.configuration.generator.generate(request);
    const parsed = generatorOutputSchema.safeParse(output);
    const expectedModelIdentity = `${this.configuration.model.name}@${this.configuration.model.pinnedVersion}`;
    if (!parsed.success || parsed.data.provider !== this.configuration.provider || parsed.data.model !== expectedModelIdentity) {
      throw new CompositionError("generator-unavailable", "Configured provider identity does not match its schema-constrained output.");
    }
    return parsed.data;
  }
}

export function productionGenerator(configuration?: ProductionGeneratorConfiguration): NarrativeGenerator {
  if (!configuration || !configuration.provider || !configuration.model.name || !configuration.model.pinnedVersion ||
      configuration.trainingDisabled !== true || configuration.retention !== "zero") {
    return new UnavailableProductionGenerator();
  }
  return new ConfiguredProductionGenerator(configuration);
}

function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const forbiddenClaim = /\b(?:dream|aspir(?:e|ation)|believe|value|opinion|passion|award-winning|best-in-class|production-ready)\b/i;
const firstPerson = /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/i;
const placeholder = /(?:\[(?:todo|tbd|placeholder)\]|\{\{.+?\}\}|lorem ipsum)/i;
const spellingFinding = /\b(?:dependablee|softare|enginer(?:ing)?)\b/i;

function validateSentence(text: string, placement: "card" | "about" | "experience" | "project"): string | null {
  if (placeholder.test(text)) return "generated text contains a placeholder";
  if (forbiddenClaim.test(text)) return "generated text contains a forbidden claim category";
  if (placement === "project" && firstPerson.test(text)) return "first person is prohibited in project copy";
  if (placement === "experience" && !firstPerson.test(text)) return "Experience copy must be first person";
  if (spellingFinding.test(text)) return "generated text contains an unallowlisted spelling finding";
  if (/\s{2,}/.test(text) || !/^[A-Z0-9]/.test(text) || !/[.!?]$/.test(text)) {
    return "generated text fails deterministic grammar rules";
  }
  return null;
}

function unsupportedNamedAssertion(text: string, evidence: string[]): string | null {
  const corpus = evidence.join(" ").normalize("NFKC").toLocaleLowerCase();
  const asserted = text.match(/\b(?:[A-Z][A-Za-z0-9+.#-]{2,}|[A-Za-z]+[A-Z][A-Za-z0-9+.#-]*|\d[\d,.+%-]*)\b/g) ?? [];
  const grammatical = new Set(["a", "an", "the", "i"]);
  const unsupported = asserted.find((term) => !grammatical.has(term.toLocaleLowerCase()) && !corpus.includes(term.toLocaleLowerCase()));
  return unsupported ? `generated text contains unsupported named assertion ${unsupported}` : null;
}

const connectiveVocabulary = new Set(
  "a an and are as at automation be been being build builds built by capabilities capability careful complex connect connects data dependable developer documented engineering evidence for from grounded have helps i implementation in into its maintainable of practical presents problem reliable remain services software solve source source-grounded systems teams technical tested that the their through to tools traceable turn turns using whose with work workflows".split(" "),
);

function unsupportedVocabulary(text: string, evidence: string[]): string | null {
  const supported = new Set(evidence.join(" ").normalize("NFKC").toLocaleLowerCase().match(/[a-z0-9+#-]+/g) ?? []);
  const asserted = text.normalize("NFKC").toLocaleLowerCase().match(/[a-z0-9+#-]+/g) ?? [];
  const unsupported = asserted.find((term) => !supported.has(term) && !connectiveVocabulary.has(term));
  return unsupported ? `generated text contains unsupported assertion ${unsupported}` : null;
}

function clauseSupportFinding(text: string, citedEvidence: string[]): string | null {
  const normalizedClause = text.normalize("NFKC").toLocaleLowerCase();
  const tokens = normalizedClause.match(/[a-z0-9+#-]+/g) ?? [];
  const stopWords = new Set("a an and are as at be been being by for from i in into its of that the their through to whose with".split(" "));
  const substantive = tokens.filter((term) => !stopWords.has(term));
  const corpus = citedEvidence.join(" ").normalize("NFKC").toLocaleLowerCase();
  const supported = substantive.filter((term) => corpus.includes(term));
  const required = Math.max(2, Math.ceil(substantive.length * 0.4));
  if (!substantive.length || supported.length < required) {
    return "generated clause lacks substantial support in its cited evidence";
  }
  return null;
}

export async function generateBoundedNarrative(
  generator: NarrativeGenerator,
  rawRequest: GeneratorRequest,
): Promise<GeneratorOutput> {
  const requestResult = generatorRequestSchema.safeParse(rawRequest);
  if (!requestResult.success) {
    throw new CompositionError("generator-schema-invalid", "Generator request does not satisfy the evidence contract.");
  }
  const rawOutput = await generator.generate(requestResult.data);
  const outputResult = generatorOutputSchema.safeParse(rawOutput);
  if (!outputResult.success) {
    throw new CompositionError("generator-schema-invalid", "Generator output does not satisfy the strict output schema.");
  }
  const output = outputResult.data;
  const requestById = new Map(requestResult.data.requests.map((item) => [item.id, item]));
  if (output.sentences.length !== requestById.size || new Set(output.sentences.map(({ requestId }) => requestId)).size !== requestById.size) {
    throw new CompositionError("generator-schema-invalid", "Generator must return every requested sentence exactly once.");
  }
  const globalEvidence = new Set(requestResult.data.evidence.map(({ id }) => id));
  const seenText = new Set<string>();
  let aboutWords = 0;
  for (const sentence of output.sentences) {
    const requested = requestById.get(sentence.requestId);
    if (!requested) throw new CompositionError("generator-schema-invalid", "Generator returned an unrequested sentence.");
    const normalizedText = sentence.text.trim().toLocaleLowerCase();
    if (seenText.has(normalizedText)) {
      throw new CompositionError("generator-content-invalid", "Generator repeated a sentence.");
    }
    seenText.add(normalizedText);
    const count = words(sentence.text);
    if (count < requested.minimumWords || count > requested.maximumWords) {
      throw new CompositionError("generator-content-invalid", `Generated ${sentence.requestId} violates its word bound.`);
    }
    if (requested.placement === "about") aboutWords += count;
    const contentFinding = validateSentence(sentence.text, requested.placement);
    if (contentFinding) throw new CompositionError("generator-content-invalid", contentFinding);
    const suppliedEvidence = requested.evidenceIds.map(
      (id) => requestResult.data.evidence.find((item) => item.id === id)!.text,
    );
    suppliedEvidence.push(requested.subject);
    const unsupported = unsupportedNamedAssertion(sentence.text, suppliedEvidence);
    if (unsupported) throw new CompositionError("generator-content-invalid", unsupported);
    const unsupportedTerm = unsupportedVocabulary(sentence.text, suppliedEvidence);
    if (unsupportedTerm) throw new CompositionError("generator-content-invalid", unsupportedTerm);
    if (sentence.clauses.map(({ text }) => text).join(" ") !== sentence.text) {
      throw new CompositionError("generator-content-invalid", "Clause text must exactly reconstruct its sentence.");
    }
    const allowed = new Set(requested.evidenceIds);
    for (const clause of sentence.clauses) {
      if (clause.evidenceIds.some((id) => !globalEvidence.has(id) || !allowed.has(id))) {
        throw new CompositionError("generator-reference-invalid", "Generated clause cites unknown or unsupplied evidence.");
      }
      const citedEvidence = clause.evidenceIds.map(
        (id) => requestResult.data.evidence.find((item) => item.id === id)!.text,
      );
      const unsupportedClauseTerm = unsupportedVocabulary(clause.text, [...citedEvidence, requested.subject]);
      if (unsupportedClauseTerm) throw new CompositionError("generator-content-invalid", unsupportedClauseTerm);
      const clauseFinding = clauseSupportFinding(clause.text, citedEvidence);
      if (clauseFinding) throw new CompositionError("generator-content-invalid", clauseFinding);
    }
  }
  if (aboutWords > 100) throw new CompositionError("generator-content-invalid", "About copy exceeds 100 words.");
  return output;
}
