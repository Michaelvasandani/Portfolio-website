import type {
  ImmediateFailureKind,
  ObjectiveFailure,
  ProductionFailureObservation,
  ProductionObservationKind,
  SmokeFailureKind,
} from "./service";

const immediateKinds = new Set<ProductionObservationKind>(["manifest-hash", "deployment-hash", "critical-content"]);
const smokeKinds = new Set<ProductionObservationKind>(["availability", "asset", "runtime", "navigation", "accessibility-smoke"]);

export function classifyObjectiveFailure(observations: readonly ProductionFailureObservation[]): ObjectiveFailure | null {
  const latest = observations.at(-1);
  if (!latest || !validFailureEvidence(latest)) return null;
  if (immediateKinds.has(latest.kind)) {
    return { trigger: "immediate", kind: latest.kind as ImmediateFailureKind, evidenceCount: 1 };
  }
  if (!smokeKinds.has(latest.kind)) return null;
  const matching = observations.filter(({ deploymentId, kind }) => deploymentId === latest.deploymentId && kind === latest.kind).slice(-3);
  if (!matching.every(validFailureEvidence)) return null;
  if (matching.length !== 3 || new Set(matching.map(({ probeIdentity }) => probeIdentity)).size !== 3) return null;
  const times = matching.map(({ observedAt }) => new Date(observedAt).getTime());
  if (times.some(Number.isNaN) || times[1]! <= times[0]! || times[2]! <= times[1]! || times[2]! - times[0]! < 120_000) return null;
  return { trigger: "confirmed-smoke", kind: latest.kind as SmokeFailureKind, evidenceCount: 3 };
}

function validFailureEvidence(observation: ProductionFailureObservation): boolean {
  const { check } = observation;
  const started = new Date(check.startedAt).getTime();
  const finished = new Date(check.finishedAt).getTime();
  return Boolean(check.checkerId && check.checkerVersion && check.reportPointer)
    && check.configurationHash.startsWith("sha256:")
    && check.target === observation.deploymentId
    && check.outcome === "failed"
    && !Number.isNaN(started) && !Number.isNaN(finished) && finished >= started
    && check.retryHistory.length <= 2;
}
