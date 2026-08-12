import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalResumeText,
  createDocxFixture,
  createPdfFixture,
  LocalBlobProvider,
  PinnedLocalCareerSandbox,
} from "./local-parser";
import { CareerIngestionService } from "./service";
import { InMemoryCareerIngestionStore } from "./store";

const contacts = {
  email: "michael@example.com",
  github: "https://github.com/michael",
  linkedin: "https://www.linkedin.com/in/michael",
};

describe("pinned local executable Career parser", () => {
  it.each([
    ["resume.md", "text/markdown", new TextEncoder().encode(canonicalResumeText)],
    ["resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", createDocxFixture(canonicalResumeText)],
    ["resume.pdf", "application/pdf", createPdfFixture(canonicalResumeText)],
  ] as const)("parses real %s bytes through intent, Blob, Sandbox, and transactional replacement", async (filename, declaredType, bytes) => {
    const store = new InMemoryCareerIngestionStore();
    const blob = new LocalBlobProvider();
    const sandbox = new PinnedLocalCareerSandbox(blob);
    const service = new CareerIngestionService({
      store,
      blob,
      sandbox,
      contacts,
      now: () => new Date("2026-08-12T19:00:00.000Z"),
      randomId: () => filename.replace(".", "-"),
    });
    const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

    const grant = await service.issueUpload({ filename, declaredType, size: bytes.byteLength, expectedHash: hash });
    await blob.put(grant, bytes);
    const outcome = await service.completeUpload({ intentId: grant.intentId, objectKey: grant.objectKey });

    expect(outcome.decision).toBe("accepted");
    expect(store.currentSnapshot()).toMatchObject({
      sourceDocumentHash: hash,
      person: {
        name: { original: "Michael Vasandani", sourceLocation: "line:1" },
        contacts: [
          { kind: "email", value: { original: contacts.email } },
          { kind: "github", value: { original: contacts.github } },
          { kind: "linkedin", value: { original: contacts.linkedin } },
        ],
      },
      experience: [{
        organization: { original: "Example Corp" },
        title: { original: "Engineer" },
        dates: { start: { original: "2025" }, current: true },
        bullets: [{ text: { original: "Built dependable systems." } }],
      }],
      projects: [{
        name: { original: "Portfolio" },
        technologies: [{ original: "TypeScript" }, { original: "Next.js" }],
        sourceLinks: [{ original: "https://github.com/michael/portfolio" }],
      }],
    });
    expect(store.deletionRecords()).toHaveLength(1);
  });

  it("uses fixed, reproducible byte fixture digests", () => {
    const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    expect({
      markdown: digest(new TextEncoder().encode(canonicalResumeText)),
      docx: digest(createDocxFixture(canonicalResumeText)),
      pdf: digest(createPdfFixture(canonicalResumeText)),
    }).toEqual({
      markdown: "ae3eab2881f9cd77713889cc9e7b64870ff069d82cf467950c71c9df0a685d41",
      docx: "8ba46e50bc3cb886f752827be77f37de910fb0ec2f09cf0a7fa737fe43077b3d",
      pdf: "4245cebc6193416abf1ac36bb9a9d122ca88115b73fccd89073d42acd98ad757",
    });
  });
});
