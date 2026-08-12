import { createHash } from "node:crypto";

import {
  canonicalResumeText,
  createDocxFixture,
  createPdfFixture,
  LocalBlobProvider,
  PinnedLocalCareerSandbox,
} from "../src/ingestion/local-parser";
import { CareerIngestionMaintenance } from "../src/ingestion/maintenance";
import { CareerIngestionService } from "../src/ingestion/service";
import { InMemoryCareerIngestionStore } from "../src/ingestion/store";

const contacts = {
  email: "michael@example.com",
  github: "https://github.com/michael",
  linkedin: "https://www.linkedin.com/in/michael",
};
const fixtures = [
  { filename: "resume.md", type: "text/markdown", bytes: new TextEncoder().encode(canonicalResumeText) },
  {
    filename: "resume.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: createDocxFixture(canonicalResumeText),
  },
  { filename: "resume.pdf", type: "application/pdf", bytes: createPdfFixture(canonicalResumeText) },
] as const;

const results = [];
for (const [index, fixture] of fixtures.entries()) {
  const store = new InMemoryCareerIngestionStore();
  const blob = new LocalBlobProvider();
  const service = new CareerIngestionService({
    store,
    blob,
    sandbox: new PinnedLocalCareerSandbox(blob),
    contacts,
    now: () => new Date("2026-08-12T19:00:00.000Z"),
    randomId: () => `fixture-${index + 1}`,
  });
  const hash = `sha256:${createHash("sha256").update(fixture.bytes).digest("hex")}`;
  const grant = await service.issueUpload({
    filename: fixture.filename,
    declaredType: fixture.type,
    size: fixture.bytes.byteLength,
    expectedHash: hash,
  });
  await blob.put(grant, fixture.bytes);
  const outcome = await service.completeUpload({ intentId: grant.intentId, objectKey: grant.objectKey });
  const snapshot = store.currentSnapshot();
  if (!snapshot || snapshot.sourceDocumentHash !== hash || snapshot.person.name.original !== "Michael Vasandani") {
    throw new Error(`${fixture.filename} did not produce the expected complete Career snapshot.`);
  }
  await new CareerIngestionMaintenance({
    store,
    blob,
    now: () => new Date("2026-08-12T19:00:01.000Z"),
  }).run();
  results.push({
    filename: fixture.filename,
    bytes: fixture.bytes.byteLength,
    documentHash: hash,
    snapshotId: outcome.snapshotId,
    deletionState: store.deletionRecords()[0]?.state,
  });
}

console.log(JSON.stringify({ parser: "portfolio-career-parser@1.0.0-local", results }, null, 2));
