import { describe, expect, it } from "vitest";

import { sha256 } from "../github/canonical";
import {
  InMemoryCandidatePackageStore,
  candidatePackageBytesHash,
  scanPublicProjection,
} from "./adapters";
import { ManualPublicationClock } from "./clock";
import { FailClosedCandidatePackageStore, FailClosedDeploymentProvider, FailClosedPublicationChecks, createProductionPublicationOrchestrator } from "./production";
import { InMemoryPublicationStore } from "./store";
import { publicationFixture } from "./test-fixtures";

describe("publication production boundaries", () => {
  it("fails closed until live resources from tickets 02, 07, and 08 are available", () => {
    const unavailable = {
      store: new InMemoryPublicationStore(),
      packages: new FailClosedCandidatePackageStore(),
      deployments: new FailClosedDeploymentProvider(),
      checks: new FailClosedPublicationChecks(),
      operationalEffects: { read: async () => null, apply: async () => { throw new Error("unavailable"); } },
    };
    expect(() => createProductionPublicationOrchestrator({ ...unavailable, tickets: { controlPlane02: false, candidateComposition07: false, providerChecks08: false } })).toThrow("ticket-02-control-plane-production-adapter-unavailable");
    expect(() => createProductionPublicationOrchestrator({ ...unavailable, tickets: { controlPlane02: true, candidateComposition07: false, providerChecks08: false } })).toThrow("ticket-07-candidate-composition-production-adapter-unavailable");
    expect(() => createProductionPublicationOrchestrator({ ...unavailable, tickets: { controlPlane02: true, candidateComposition07: true, providerChecks08: false } })).toThrow("ticket-08-provider-checks-production-adapter-unavailable");
  });

  it("rejects private projection fields and expired candidate-scoped credentials", async () => {
    expect(scanPublicProjection({ name: "Michael", evidenceId: "evidence:private" })).toEqual(["evidenceId:private-key"]);
    const clock = new ManualPublicationClock();
    const store = new InMemoryCandidatePackageStore();
    const original = publicationFixture().input().candidate;
    const stored = await store.put(original, "put:original");
    const credential = await store.issueBuildCredential({ packageId: stored.packageId, candidateHash: original.candidateHash, expiresAt: new Date(clock.now().getTime() + 1).toISOString() });
    clock.advance(1);
    await expect(store.retrieve(credential.token, stored.packageId, clock.now().toISOString())).rejects.toThrow("candidate-credential-expired");

    const privateContents = {
      id: "candidate:private", candidateHash: sha256("private"), publicOutputHash: sha256(JSON.stringify({ evidenceId: "evidence:private" })),
      manifestHash: sha256("private-manifest"), publicProjection: { ...original.publicProjection, evidenceId: "evidence:private" },
      manifestBindings: original.manifestBindings,
    };
    const invalidCandidate = { ...privateContents, bytesHash: candidatePackageBytesHash(privateContents as unknown as Omit<typeof original, "bytesHash">) } as unknown as typeof original;
    await expect(store.put(invalidCandidate, "put:private")).rejects.toThrow();
  });
});
