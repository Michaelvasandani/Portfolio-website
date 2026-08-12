import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type {
  BlobUploadProvider,
  CareerDraft,
  CareerSandbox,
  ClientUploadGrant,
  SandboxParseReport,
  SupportedCareerDocumentType,
} from "./service";

export const canonicalResumeText = `# Michael Vasandani
Location: San Francisco, CA
Email: michael@example.com
GitHub: https://github.com/michael
LinkedIn: https://www.linkedin.com/in/michael

## Experience
### Engineer | Example Corp
Dates: 2025 - Present
- Built dependable systems.

## Projects
### Portfolio
Technologies: TypeScript, Next.js
Links: https://github.com/michael/portfolio
- Built an evidence-bound portfolio.

## Skills
### Languages
- TypeScript`;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function createDocxFixture(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const paragraphs = text.split("\n").map((line) =>
    `<w:p><w:r><w:t xml:space="preserve">${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</w:t></w:r></w:p>`,
  ).join("");
  const entries = [
    {
      name: "[Content_Types].xml",
      value: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      value: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: "word/document.xml",
      value: `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`,
    },
  ];
  const localRecords: Uint8Array[] = [];
  const directories: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.value);
    const crc = crc32(data);
    const local = new Uint8Array(30);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    const localRecord = concat(local, name, data);
    localRecords.push(localRecord);
    const central = new Uint8Array(46);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(42, localOffset, true);
    directories.push(concat(central, name));
    localOffset += localRecord.byteLength;
  }
  const localRecord = concat(...localRecords);
  const directory = concat(...directories);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directory.byteLength, true);
  endView.setUint32(16, localRecord.byteLength, true);
  return concat(localRecord, directory, end);
}

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

export function createPdfFixture(text: string): Uint8Array {
  const operations = text.split("\n").map((line) => `(${escapePdfText(line)}) Tj`).join("\n");
  const encoder = new TextEncoder();
  const objects = [
    `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n`,
    `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n`,
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj\n`,
    `4 0 obj << /Length ${operations.length + 15} >> stream\nBT\n/F1 10 Tf\n${operations}\nET\nendstream\nendobj\n`,
    `5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`,
  ];
  const header = encoder.encode("%PDF-1.7\n");
  const offsets: number[] = [];
  let offset = header.byteLength;
  const objectBytes = objects.map((object) => {
    offsets.push(offset);
    const bytes = encoder.encode(object);
    offset += bytes.byteLength;
    return bytes;
  });
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return concat(header, ...objectBytes, encoder.encode(xref));
}

type StoredBlob = { bytes: Uint8Array; contentType: string };

export class LocalBlobProvider implements BlobUploadProvider {
  readonly #blobs = new Map<string, StoredBlob>();
  readonly #grants = new Map<string, ClientUploadGrant>();

  async issueClientUploadGrant(input: {
    objectKey: string;
    contentType: SupportedCareerDocumentType;
    maximumBytes: number;
    expiresAt: Date;
  }): Promise<ClientUploadGrant> {
    const token = randomBytes(24).toString("base64url");
    const grant = {
      uploadUrl: `https://local-blob.invalid/upload/${encodeURIComponent(input.objectKey)}`,
      token,
      objectKey: input.objectKey,
      contentType: input.contentType,
      maximumBytes: input.maximumBytes,
      expiresAt: input.expiresAt,
    };
    this.#grants.set(token, grant);
    return grant;
  }

  async put(grant: ClientUploadGrant, bytes: Uint8Array): Promise<void> {
    const recorded = this.#grants.get(grant.token);
    if (!recorded || recorded.objectKey !== grant.objectKey || bytes.byteLength !== grant.maximumBytes) {
      throw new Error("Local Blob grant does not match the uploaded bytes.");
    }
    this.#blobs.set(grant.objectKey, { bytes: bytes.slice(), contentType: grant.contentType });
    this.#grants.delete(grant.token);
  }

  async readRaw(blobKey: string): Promise<StoredBlob> {
    const blob = this.#blobs.get(blobKey);
    if (!blob) throw new Error("Local raw Blob does not exist.");
    return { bytes: blob.bytes.slice(), contentType: blob.contentType };
  }

  async deletionState(blobKey: string): Promise<"present" | "absent"> {
    return this.#blobs.has(blobKey) ? "present" : "absent";
  }

  async deleteRawBlob(blobKey: string): Promise<{ providerReference: string }> {
    this.#blobs.delete(blobKey);
    return { providerReference: "local-deleted" };
  }
}

function source(original: string, sourceOrder: number, line: number) {
  return { original, sourceOrder, sourceLocation: `line:${line}` };
}

function parseCanonicalResume(text: string, documentHash: string): CareerDraft {
  const lines = text.split(/\r?\n/);
  const lineNumber = (prefix: string) => {
    const index = lines.findIndex((line) => line.startsWith(prefix));
    if (index < 0) throw new Error(`Missing ${prefix}`);
    return index;
  };
  const value = (prefix: string) => {
    const index = lineNumber(prefix);
    return { value: lines[index]!.slice(prefix.length).trim(), line: index + 1 };
  };
  const nameLine = lineNumber("# ");
  const name = lines[nameLine]!.slice(2).trim();
  const location = value("Location:");
  const email = value("Email:");
  const github = value("GitHub:");
  const linkedin = value("LinkedIn:");
  const experienceHeading = lineNumber("## Experience");
  const roleLine = lines.findIndex((line, index) => index > experienceHeading && line.startsWith("### "));
  const [title, organization] = lines[roleLine]!.slice(4).split(" | ");
  if (!title || !organization) throw new Error("Role parentage is ambiguous.");
  const dates = value("Dates:");
  const [start, end] = dates.value.split(" - ");
  const roleBulletLine = lines.findIndex((line, index) => index > roleLine && line.startsWith("- "));
  const projectsHeading = lineNumber("## Projects");
  const projectLine = lines.findIndex((line, index) => index > projectsHeading && line.startsWith("### "));
  const projectName = lines[projectLine]!.slice(4).trim();
  const technologies = value("Technologies:");
  const links = value("Links:");
  const projectBulletLine = lines.findIndex((line, index) => index > projectLine && line.startsWith("- "));
  const skillsHeading = lineNumber("## Skills");
  const skillGroupLine = lines.findIndex((line, index) => index > skillsHeading && line.startsWith("### "));
  const skillLine = lines.findIndex((line, index) => index > skillGroupLine && line.startsWith("- "));

  return {
    schemaVersion: 1,
    sourceDocumentHash: documentHash,
    person: {
      name: source(name, 0, nameLine + 1),
      location: source(location.value, 1, location.line),
      contacts: [
        { kind: "email", value: source(email.value, 2, email.line) },
        { kind: "github", value: source(github.value, 3, github.line) },
        { kind: "linkedin", value: source(linkedin.value, 4, linkedin.line) },
      ],
    },
    experience: [{
      id: "experience:example-corp-engineer",
      organization: source(organization, 1, roleLine + 1),
      title: source(title, 0, roleLine + 1),
      dates: {
        start: source(start!, 2, dates.line),
        end: end?.toLowerCase() === "present" ? undefined : source(end!, 3, dates.line),
        current: end?.toLowerCase() === "present",
      },
      sourceOrder: 0,
      bullets: [{ text: source(lines[roleBulletLine]!.slice(2), 3, roleBulletLine + 1), sourceOrder: 0 }],
    }],
    education: [],
    projects: [{
      id: "project:portfolio",
      name: source(projectName, 0, projectLine + 1),
      technologies: technologies.value.split(",").map((item, index) => source(item.trim(), index + 1, technologies.line)),
      sourceLinks: links.value.split(",").map((item, index) => source(item.trim(), index + 3, links.line)),
      sourceOrder: 0,
      bullets: [{ text: source(lines[projectBulletLine]!.slice(2), 4, projectBulletLine + 1), sourceOrder: 0 }],
    }],
    skills: [{
      name: source(lines[skillGroupLine]!.slice(4), 0, skillGroupLine + 1),
      items: [source(lines[skillLine]!.slice(2), 1, skillLine + 1)],
      sourceOrder: 0,
    }],
    optionalSections: [],
  };
}

function decodeXml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function extractDocx(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let xml = "";
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    if (view.getUint16(offset + 8, true) !== 0) throw new Error("Unsupported DOCX compression.");
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataStart = offset + 30 + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    if (name === "word/document.xml") xml = new TextDecoder().decode(bytes.slice(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  if (!xml) throw new Error("DOCX document part is missing.");
  return [...xml.matchAll(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1]!)).join("\n");
}

function extractPdf(bytes: Uint8Array): string {
  const sourceText = new TextDecoder("latin1").decode(bytes);
  return [...sourceText.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
    .map((match) => match[1]!.replaceAll("\\(", "(").replaceAll("\\)", ")").replaceAll("\\\\", "\\"))
    .join("\n");
}

export class PinnedLocalCareerSandbox implements CareerSandbox {
  constructor(private readonly blob: LocalBlobProvider) {}

  async parse(input: Parameters<CareerSandbox["parse"]>[0]): Promise<SandboxParseReport> {
    const started = performance.now();
    const blob = await this.blob.readRaw(input.blobKey);
    const bytes = blob.bytes;
    const computedHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    let detectedType: SupportedCareerDocumentType;
    let text: string;
    let fileCount = 1;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      detectedType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      text = extractDocx(bytes);
      fileCount = 1;
    } else if (new TextDecoder("latin1").decode(bytes.slice(0, 5)) === "%PDF-") {
      detectedType = "application/pdf";
      text = extractPdf(bytes);
    } else {
      detectedType = "text/markdown";
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    const career = parseCanonicalResume(text, computedHash);
    const extractedTextBytes = new TextEncoder().encode(text).byteLength;
    return {
      schemaVersion: 1,
      parser: input.parser,
      policy: input.policy,
      validations: {
        detectedType,
        computedHash,
        sourceBytes: bytes.byteLength,
        signatureValid: detectedType === input.declaredType,
        parserCompatible: true,
        encrypted: false,
        imageOnly: false,
        macros: false,
        linkedResources: false,
        metadataEntries: 0,
        metadataSanitized: true,
        networkAttempts: 0,
        blockedNetworkAttempts: 0,
        elapsedMs: performance.now() - started,
        peakMemoryBytes: bytes.byteLength + extractedTextBytes,
        fileCount,
        expandedBytes: extractedTextBytes,
        extractedTextBytes,
        extractedCharacters: text.length,
        recognizedCharacters: text.length,
      },
      findings: [],
      career,
    };
  }
}
