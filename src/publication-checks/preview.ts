import { canonicalJson, sha256 } from "../github/canonical";
import type { ImmutablePreviewTarget, PreviewObservations, Sha256 } from "./contracts";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value as Readonly<T>;
}

export function immutableTargetIdentity(target: ImmutablePreviewTarget): Sha256 {
  return sha256(canonicalJson({
    candidateHash: target.candidate.hashes.candidateHash,
    manifestHash: target.candidate.publicManifestHash,
    publicOutputHash: target.candidate.hashes.publicOutputHash,
    deploymentId: target.preview.deploymentId,
    artifacts: target.preview.artifacts,
  }));
}

export function createImmutablePreviewTarget(input: {
  candidate: ImmutablePreviewTarget["candidate"];
  deploymentId: string;
  origin: string;
  capturedAt: string;
  artifacts: ImmutablePreviewTarget["preview"]["artifacts"];
  observations: PreviewObservations;
  previewHashes?: Partial<Pick<ImmutablePreviewTarget["preview"], "candidateHash" | "manifestHash" | "publicOutputHash">>;
}): ImmutablePreviewTarget {
  return deepFreeze({
    candidate: structuredClone(input.candidate),
    preview: {
      deploymentId: input.deploymentId,
      origin: input.origin,
      zeroTraffic: true,
      productionShaped: true,
      candidateHash: input.previewHashes?.candidateHash ?? input.candidate.hashes.candidateHash,
      manifestHash: input.previewHashes?.manifestHash ?? input.candidate.publicManifestHash,
      publicOutputHash: input.previewHashes?.publicOutputHash ?? input.candidate.hashes.publicOutputHash,
      capturedAt: input.capturedAt,
      artifacts: structuredClone(input.artifacts),
      observations: structuredClone(input.observations),
    },
  });
}
