import { createHash } from "node:crypto";

export interface TextArtifact {
  path: string;
  content: string;
}

export interface ScanFinding {
  path: string;
  category: "credential" | "privileged-endpoint";
  fingerprint: string;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

const credentialPatterns = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bvcp_[A-Za-z0-9_-]{20,}\b/g,
  /\bre_[A-Za-z0-9_-]{20,}\b/g,
  /\bvercel_blob_(?:rw_)?[A-Za-z0-9_-]{20,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];
const privilegedEndpointPatterns = [
  /postgres(?:ql)?:\/\/[^\s"'`]+/g,
  /https:\/\/[^\s"'`]*(?:\.neon\.tech|\.blob\.vercel-storage\.com)(?:\/[^\s"'`]*)?/g,
  /https:\/\/(?:api\.vercel\.com|api\.resend\.com|api\.openai\.com)(?:\/[^\s"'`]*)?/g,
];

function isDocumentedSafeExample(value: string): boolean {
  if (/(?:test|example|local[_-]?only|development[_-]?only|at[_-]?least)/i.test(value)) return true;
  try {
    const endpoint = new URL(value);
    return ["127.0.0.1", "localhost"].includes(endpoint.hostname) || endpoint.hostname.endsWith(".example.com");
  } catch {
    return false;
  }
}

export function scanTextArtifacts(artifacts: TextArtifact[]): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const artifact of artifacts) {
    for (const pattern of credentialPatterns) {
      for (const match of artifact.content.matchAll(pattern)) {
        if (isDocumentedSafeExample(match[0])) continue;
        findings.push({ path: artifact.path, category: "credential", fingerprint: fingerprint(match[0]) });
      }
    }
    for (const pattern of privilegedEndpointPatterns) {
      for (const match of artifact.content.matchAll(pattern)) {
        if (isDocumentedSafeExample(match[0])) continue;
        findings.push({
          path: artifact.path,
          category: "privileged-endpoint",
          fingerprint: fingerprint(match[0]),
        });
      }
    }
  }
  return findings;
}
