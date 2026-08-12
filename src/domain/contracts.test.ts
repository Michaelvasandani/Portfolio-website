import { describe, expect, it } from "vitest";

import {
  type ContractName,
  contractParsers,
  parseEvidencePacket,
  parsePublicationManifest,
} from "./contracts";
import { contractSamples } from "./test-samples";

describe("versioned domain contracts", () => {
  for (const name of Object.keys(contractParsers) as ContractName[]) {
    const parse = contractParsers[name];
    it(`${name} accepts its valid v1 contract`, () => {
      expect(parse(contractSamples[name])).toEqual(contractSamples[name]);
    });

    it(`${name} rejects an unknown schema version`, () => {
      expect(() => parse({ ...contractSamples[name], schemaVersion: 2 })).toThrow();
    });

    it(`${name} rejects a missing immutable identity`, () => {
      const withoutId = { ...contractSamples[name] };
      delete withoutId.id;
      expect(() => parse(withoutId)).toThrow();
    });

    it(`${name} rejects a missing content hash`, () => {
      const withoutHash = { ...contractSamples[name] };
      delete withoutHash.contentHash;
      expect(() => parse(withoutHash)).toThrow();
    });
  }

  it("rejects evidence references outside the packet's pinned snapshots", () => {
    expect(() =>
      parseEvidencePacket({
        ...contractSamples.evidencePacket,
        references: [
          {
            source: "career",
            snapshotId: "career:other",
            fieldPath: "person.name",
            valueHash: contractSamples.evidencePacket.contentHash,
          },
        ],
      }),
    ).toThrow(/pinned/i);
  });

  it("rejects manifest evidence outside its pinned inputs", () => {
    expect(() =>
      parsePublicationManifest({
        ...contractSamples.publicationManifest,
        evidenceReferences: [
          {
            source: "github",
            snapshotId: "github:other",
            fieldPath: "repositories.0.name",
            valueHash: contractSamples.publicationManifest.contentHash,
          },
        ],
      }),
    ).toThrow(/pinned/i);
  });

  it("rejects generated clauses whose evidence is outside the pinned inputs", () => {
    expect(() =>
      contractParsers.generatedOutput({
        ...contractSamples.generatedOutput,
        clauses: [
          {
            id: "clause:one",
            text: "I build dependable systems.",
            placement: "card",
            evidenceReferences: [
              {
                source: "career",
                snapshotId: "career:other",
                fieldPath: "person.name",
                valueHash: contractSamples.generatedOutput.contentHash,
              },
            ],
          },
        ],
      }),
    ).toThrow(/pinned/i);
  });
});
