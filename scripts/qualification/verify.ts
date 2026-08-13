import process from "node:process";
import { resolve } from "node:path";

import { runProductionQualification } from "../../src/qualification/repository";

interface Arguments {
  evidence: string;
  output: string;
  artifactRoot?: string;
  ownerPublicKey?: string;
  generatedAt?: string;
}

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = {
    evidence: "evidence/ticket-11/production-evidence.json",
    output: "evidence/ticket-11",
  };
  const args = argv.filter((argument) => argument !== "--");
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`Missing value for ${name ?? "argument"}`);
    if (name === "--evidence") result.evidence = value;
    else if (name === "--output") result.output = value;
    else if (name === "--generated-at") result.generatedAt = value;
    else if (name === "--artifact-root") result.artifactRoot = value;
    else if (name === "--owner-public-key") result.ownerPublicKey = value;
    else throw new Error(`Unknown argument: ${name}`);
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const repositoryRoot = process.cwd();
  const result = await runProductionQualification({
    repositoryRoot,
    productionEvidencePath: resolve(repositoryRoot, args.evidence),
    outputDirectory: resolve(repositoryRoot, args.output),
    ...(args.artifactRoot ? { artifactRoot: resolve(repositoryRoot, args.artifactRoot) } : {}),
    ...(args.ownerPublicKey
      ? { ownerPublicKeyPath: resolve(repositoryRoot, args.ownerPublicKey) }
      : {}),
    ...(args.generatedAt ? { generatedAt: args.generatedAt } : {}),
  });
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Qualification failed"}\n`);
  process.exitCode = 1;
});
