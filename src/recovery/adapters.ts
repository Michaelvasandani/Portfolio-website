import { canonicalJson, sha256 } from "../github/canonical";
import { AmbiguousProviderResultError, ProductionAdapterUnavailableError } from "../publication/contracts";
import { clone } from "./provider-effect";
import type { RecoveryDeployment, RecoveryProvider, RecoveryVerification } from "./service";

export class InMemoryRecoveryProvider implements RecoveryProvider {
  readonly #deployments = new Map<string, RecoveryDeployment>();
  readonly #routes = new Map<string, { providerDeploymentId: string; providerReference: string }>();
  #servedProviderDeploymentId: string;
  #ambiguousRouteResponses: number;
  readonly routeChanges: { idempotencyKey: string; providerDeploymentId: string }[] = [];
  readonly verifications: string[] = [];
  routingReads = 0;

  constructor(private readonly input: {
    deployments: readonly RecoveryDeployment[];
    servedDeploymentId: string;
    ambiguousRouteResponses?: number;
    verificationOutcome?: "passed" | "failed";
    verificationEvidence?: Partial<RecoveryVerification["check"]>;
  }) {
    for (const deployment of input.deployments) this.#deployments.set(deployment.id, clone(deployment));
    const served = this.#deployments.get(input.servedDeploymentId);
    if (!served) throw new Error("provider-served-deployment-missing");
    this.#servedProviderDeploymentId = served.providerDeploymentId;
    this.#ambiguousRouteResponses = input.ambiguousRouteResponses ?? 0;
  }

  async readRouting() {
    this.routingReads += 1;
    return { providerDeploymentId: this.#servedProviderDeploymentId };
  }

  async readPublicState() {
    const deployment = [...this.#deployments.values()].find(({ providerDeploymentId }) => providerDeploymentId === this.#servedProviderDeploymentId);
    if (!deployment) throw new Error("provider-served-deployment-missing");
    return {
      providerDeploymentId: deployment.providerDeploymentId,
      publicOutputHash: deployment.publicOutputHash,
      observedAt: new Date().toISOString(),
    };
  }

  async route(input: { idempotencyKey: string; providerDeploymentId: string }) {
    const existing = this.#routes.get(input.idempotencyKey);
    if (existing) return clone(existing);
    if (![...this.#deployments.values()].some(({ providerDeploymentId }) => providerDeploymentId === input.providerDeploymentId)) throw new Error("provider-recovery-target-missing");
    const routed = { providerDeploymentId: input.providerDeploymentId, providerReference: `route:${sha256(canonicalJson(input)).slice(7, 31)}` };
    this.#routes.set(input.idempotencyKey, routed);
    this.#servedProviderDeploymentId = input.providerDeploymentId;
    this.routeChanges.push(clone(input));
    if (this.#ambiguousRouteResponses > 0) {
      this.#ambiguousRouteResponses -= 1;
      throw new AmbiguousProviderResultError("rollback-applied-response-lost");
    }
    return clone(routed);
  }

  async verify(deployment: RecoveryDeployment, checkedAt = new Date()): Promise<RecoveryVerification> {
    this.verifications.push(deployment.providerDeploymentId);
    const at = checkedAt.toISOString();
    const rulesHash = sha256(canonicalJson({
      identities: ["provider-deployment", "candidate", "manifest", "public-output"],
      blockingSmoke: ["availability", "asset", "runtime", "navigation", "accessibility-smoke"],
    }));
    const environment = {
      runner: "in-memory",
      image: "local-recovery-v1",
      cleanEnvironmentId: `clean:${sha256(`${deployment.id}:${at}`).slice(7, 31)}`,
    };
    return {
      providerDeploymentId: deployment.providerDeploymentId,
      candidateHash: deployment.candidateHash,
      manifestHash: deployment.manifestHash,
      publicOutputHash: deployment.publicOutputHash,
      check: {
        checkerId: "recovery-identity-and-smoke",
        checkerVersion: "1.0.0",
        rulesHash,
        configurationHash: sha256(canonicalJson({ checkerVersion: "1.0.0", rulesHash, environment, retryLimit: 2 })),
        environment,
        target: deployment.id,
        startedAt: at,
        finishedAt: at,
        outcome: this.input.verificationOutcome ?? "passed",
        measurements: {
          providerDeploymentMatches: true,
          candidateHashMatches: true,
          manifestHashMatches: true,
          publicOutputHashMatches: true,
        },
        retryHistory: [],
        reportPointer: `memory://recovery/${sha256(deployment.providerDeploymentId).slice(7, 31)}`,
        ...this.input.verificationEvidence,
      },
    };
  }
}

export class FailClosedRecoveryProvider implements RecoveryProvider {
  async readRouting(): Promise<never> { throw new ProductionAdapterUnavailableError("vercel-recovery-routing"); }
  async readPublicState(): Promise<never> { throw new ProductionAdapterUnavailableError("provider-backed-public-observation"); }
  async route(input: { idempotencyKey: string; providerDeploymentId: string }): Promise<never> {
    void input;
    throw new ProductionAdapterUnavailableError("vercel-recovery-routing");
  }
  async verify(input: RecoveryDeployment, checkedAt?: Date): Promise<never> {
    void input;
    void checkedAt;
    throw new ProductionAdapterUnavailableError("provider-backed-recovery-checks");
  }
}
