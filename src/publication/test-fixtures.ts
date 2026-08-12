import { canonicalJson, sha256 } from "../github/canonical";
import type { PublicProjection } from "../composition/projection";
import type { CandidatePackageStore, DeploymentProvider, PublicationChecks, PublicationInput } from "./contracts";
import { candidatePackageBytesHash } from "./adapters";
import { NORMATIVE_CONFIG_HASH } from "../publication-checks/config";
import { publicationCheckInventory } from "../publication-checks/checkers";

const unavailable = async (): Promise<never> => { throw new Error("fixture-operation-not-configured"); };

export function publicationFixture() {
  const candidateHash = sha256("candidate");
  const contacts = [{ kind: "email" as const, label: "Email Michael", href: "mailto:michael@example.com" }];
  const resume = { name: "Michael", contacts, experience: [], education: [], projects: [], skills: [], optionalSections: [] };
  const manifestHash = sha256("manifest");
  const publicProjection: PublicProjection = {
    schemaVersion: 1 as const,
    metadata: { title: "Michael", description: "Portfolio" },
    sections: [
      { kind: "card" as const, name: "Michael", kicker: "Engineer", role: "Software engineer", proof: "I build dependable software systems with careful evidence, testing, and operational discipline.", contacts },
      { kind: "about" as const, lede: "Dependable systems.", body: "Evidence-bound work." },
      { kind: "experience" as const, entries: [] },
      { kind: "projects" as const, entries: [] },
      { kind: "resume" as const, education: [], skills: [], optionalSections: [], htmlPath: "/resume", pdfPath: "/resume.pdf" },
      { kind: "links" as const, contacts },
    ],
    resume: { html: resume, pdf: resume },
    lastUpdated: "2026-08-12T22:00:00.000Z",
    manifestHash,
  };
  const publicOutputHash = sha256(canonicalJson(publicProjection));
  const packages: CandidatePackageStore = {
    put: unavailable,
    find: async () => null,
    issueBuildCredential: unavailable,
    retrieve: unavailable,
  };
  const deployments: DeploymentProvider = {
    createPreview: unavailable,
    findPreview: async () => null,
    promote: unavailable,
    promotionState: async () => null,
  };
  const checks: PublicationChecks = { preview: unavailable, production: unavailable };
  return {
    dependencies: { packages, deployments, checks },
    input(overrides: Partial<PublicationInput> = {}): PublicationInput {
      return {
        trigger: "manual",
        careerSnapshotId: "career:one",
        githubSnapshotId: "github:one",
        presentationPolicyId: "presentation:one",
        presentationPolicyVersion: "1.0.0",
        codeCommit: "a".repeat(40),
        schemaHash: sha256("schema"),
        parserVersion: "1.0.0",
        generatorVersion: "1.0.0",
        promptVersion: "1.0.0",
        approvedRendererCommit: "b".repeat(40),
        checkerVersions: Object.fromEntries(publicationCheckInventory.map(({ id, version }) => [id, version])),
        checkerConfigurationHashes: { publication: NORMATIVE_CONFIG_HASH },
        priorSelectionStateId: null,
        candidate: (() => {
          const contents = {
          id: "candidate:one",
          candidateHash,
          publicOutputHash,
          manifestHash,
          publicProjection,
          manifestBindings: {
            renderedFields: ["person.name"],
            generatedClauses: [{ text: "Evidence-bound work.", evidenceReferences: ["presentation:role"] }],
            transformations: [], evidenceReferences: ["presentation:role"],
            validationOutcomes: [{ name: "composition", outcome: "passed" as const }], recoveryDeploymentId: null,
          },
          };
          return { ...contents, bytesHash: candidatePackageBytesHash(contents) };
        })(),
        ...overrides,
      };
    },
  };
}
