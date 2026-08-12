import { ProductionAdapterUnavailableError, type CandidatePackageStore, type DeploymentProvider, type OperationalEffectProvider, type PublicationChecks } from "./contracts";
import { PublicationOrchestrator } from "./orchestrator";
import type { PublicationStore } from "./store";

export type ProductionPublicationResources = {
  tickets: { controlPlane02: boolean; candidateComposition07: boolean; providerChecks08: boolean };
  store: PublicationStore;
  packages: CandidatePackageStore;
  deployments: DeploymentProvider;
  checks: PublicationChecks;
  operationalEffects: OperationalEffectProvider;
};

export function createProductionPublicationOrchestrator(resources: ProductionPublicationResources): PublicationOrchestrator {
  if (!resources.tickets.controlPlane02) throw new ProductionAdapterUnavailableError("ticket-02-control-plane");
  if (!resources.tickets.candidateComposition07) throw new ProductionAdapterUnavailableError("ticket-07-candidate-composition");
  if (!resources.tickets.providerChecks08) throw new ProductionAdapterUnavailableError("ticket-08-provider-checks");
  return new PublicationOrchestrator(resources);
}

export class FailClosedCandidatePackageStore implements CandidatePackageStore {
  put(): Promise<never> { throw new ProductionAdapterUnavailableError("private-blob"); }
  find(): Promise<never> { throw new ProductionAdapterUnavailableError("private-blob"); }
  issueBuildCredential(): Promise<never> { throw new ProductionAdapterUnavailableError("candidate-credential"); }
  retrieve(): Promise<never> { throw new ProductionAdapterUnavailableError("private-blob"); }
}

export class FailClosedDeploymentProvider implements DeploymentProvider {
  createPreview(): Promise<never> { throw new ProductionAdapterUnavailableError("vercel-deployment"); }
  findPreview(): Promise<never> { throw new ProductionAdapterUnavailableError("vercel-deployment"); }
  promote(): Promise<never> { throw new ProductionAdapterUnavailableError("vercel-promotion"); }
  promotionState(): Promise<never> { throw new ProductionAdapterUnavailableError("vercel-promotion"); }
}

export class FailClosedPublicationChecks implements PublicationChecks {
  preview(): Promise<never> { throw new ProductionAdapterUnavailableError("provider-backed-publication-checks"); }
  production(): Promise<never> { throw new ProductionAdapterUnavailableError("provider-backed-production-checks"); }
}

export class FailClosedOperationalEffectProvider implements OperationalEffectProvider {
  read(): Promise<never> { throw new ProductionAdapterUnavailableError("operational-effects"); }
  apply(): Promise<never> { throw new ProductionAdapterUnavailableError("operational-effects"); }
}
