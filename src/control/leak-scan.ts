export type PublicArtifact = { path: string; content: string };
export type OwnerAccessLeakFinding = {
  path: string;
  category: "configured literal" | "control endpoint" | "credential pattern" | "privileged field name";
};

const credentialPatterns = [
  /\bgh[opusr]_[A-Za-z0-9_]{20,}\b/,
  /postgres(?:ql)?:\/\/[^\s"']+/i,
  /\b(?:vercel_blob_rw_|re_)[A-Za-z0-9_-]{16,}\b/,
];
const privilegedFieldName = /\b(?:accessToken|refreshToken|sessionToken|oauthSecret|clientSecret|sessionSecret|databaseUrl|evidenceGraph|serviceCredential)\b/i;
const controlEndpoint = /\/api\/control(?:\/|\b)/;

export function scanOwnerAccessPublicArtifacts(
  artifacts: readonly PublicArtifact[],
  configuredLiterals: readonly string[],
): OwnerAccessLeakFinding[] {
  const findings: OwnerAccessLeakFinding[] = [];
  for (const artifact of artifacts) {
    const categories = new Set<OwnerAccessLeakFinding["category"]>();
    if (configuredLiterals.some((literal) => literal.length > 0 && artifact.content.includes(literal))) {
      categories.add("configured literal");
    }
    if (credentialPatterns.some((pattern) => pattern.test(artifact.content))) {
      categories.add("credential pattern");
    }
    if (privilegedFieldName.test(artifact.content)) categories.add("privileged field name");
    if (controlEndpoint.test(artifact.content)) categories.add("control endpoint");
    for (const category of categories) findings.push({ path: artifact.path, category });
  }
  return findings;
}
