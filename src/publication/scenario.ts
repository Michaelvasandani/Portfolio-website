import { createPositiveFixture } from "../publication-checks/fixtures";
import { ExecutablePublicationChecks, InMemoryCandidatePackageStore, InMemoryDeploymentProvider, InMemoryOperationalEffectProvider, createDeterministicProductionProbe } from "./adapters";
import { ManualPublicationClock } from "./clock";
import { PublicationOrchestrator } from "./orchestrator";
import { InMemoryPublicationStore } from "./store";

export function createPublicationScenario(input: { ambiguousPreviewResponses?: number; ambiguousPromotionResponses?: number; ambiguousOperationalResponses?: number } = {}) {
  const checkerFixture = createPositiveFixture();
  const clock = new ManualPublicationClock();
  const store = new InMemoryPublicationStore();
  const packages = new InMemoryCandidatePackageStore();
  const deployments = new InMemoryDeploymentProvider({ packages, clock, observations: checkerFixture.target.preview.observations, ...input });
  const checks = new ExecutablePublicationChecks({ configuration: checkerFixture.configuration, checkers: checkerFixture.checkers, clock, productionProbe: createDeterministicProductionProbe(clock) });
  const operationalEffects = new InMemoryOperationalEffectProvider({ ambiguousResponses: input.ambiguousOperationalResponses });
  const orchestrator = new PublicationOrchestrator({ store, packages, deployments, checks, operationalEffects, clock });
  return { checkerFixture, clock, store, packages, deployments, checks, operationalEffects, orchestrator };
}
