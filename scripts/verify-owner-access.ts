import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { scanOwnerAccessPublicArtifacts, type PublicArtifact } from "../src/control/leak-scan";

const repositoryRoot = resolve(import.meta.dirname, "..");

async function filesUnder(path: string): Promise<string[]> {
  const entry = await stat(path).catch(() => null);
  if (!entry) return [];
  if (entry.isFile()) return [path];
  const children = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      children.map((child) => filesUnder(resolve(path, child.name))),
    )
  ).flat();
}

const staticFiles = await filesUnder(resolve(repositoryRoot, ".next/static"));
const publicFiles = await filesUnder(resolve(repositoryRoot, "public"));
const emittedFiles = (await filesUnder(resolve(repositoryRoot, ".next/server/app"))).filter((path) => {
  const relativePath = relative(resolve(repositoryRoot, ".next/server/app"), path);
  return (
    /\.(?:body|html|meta|rsc)$/.test(relativePath) &&
    !relativePath.startsWith("control") &&
    !relativePath.startsWith("owner-access")
  );
});
const paths = [...staticFiles, ...publicFiles, ...emittedFiles];
if (staticFiles.length === 0 || emittedFiles.length === 0) {
  throw new Error("Owner-access leak scan requires a completed Next.js build with public artifacts.");
}

const artifacts: PublicArtifact[] = await Promise.all(
  paths.map(async (path) => ({
    path: relative(repositoryRoot, path),
    content: (await readFile(path)).toString("utf8"),
  })),
);
const configuredLiterals = [
  process.env.GITHUB_APP_CLIENT_SECRET,
  process.env.GITHUB_OWNER_NUMERIC_ID,
  process.env.OWNER_SESSION_SECRET,
  process.env.DATABASE_URL,
  process.env.PRIVATE_BLOB_TOKEN,
  process.env.VERCEL_CONTROL_TOKEN,
  process.env.MODEL_API_KEY,
  process.env.RESEND_API_KEY,
].filter((value): value is string => Boolean(value));
const findings = scanOwnerAccessPublicArtifacts(artifacts, configuredLiterals);
if (findings.length > 0) {
  throw new Error(`Owner-access leak scan failed: ${JSON.stringify(findings)}`);
}

console.log(
  `Owner-access leak scan passed: ${staticFiles.length} static bundle files, ${emittedFiles.length} emitted public artifacts, and ${publicFiles.length} public files; ${configuredLiterals.length} configured literals absent.`,
);
