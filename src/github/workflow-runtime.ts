import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import type { ConditionalCache } from "./collector";
import { canonicalJson, sha256 } from "./canonical";
import { signGitHubDelivery } from "./delivery";
import { runWithBoundedRetries } from "./retry";
import {
  githubSnapshotHashesMatch,
  githubSnapshotSchema,
  hasRequiredEvidenceFailure,
} from "./snapshot-contract";

type CacheDocument = Record<string, { etag: string; body: unknown }>;

export class FileConditionalCache implements ConditionalCache {
  constructor(readonly path: string) {}

  async get(key: string) {
    return (await this.#read())[key];
  }

  async set(key: string, value: { etag: string; body: unknown }) {
    const next = { ...(await this.#read()), [key]: value };
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, canonicalJson(next), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.path);
  }

  async #read(): Promise<CacheDocument> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as CacheDocument;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
}

type BuildDeliveryOptions = {
  kind: "snapshot" | "failure";
  payload: unknown;
  repository: string;
  workflowRef: string;
  workflowSha: string;
  runId: string;
  runAttempt: number;
  sentAt: string;
};

const githubRunIdentitySchema = z
  .object({
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    workflowRef: z.string().min(1),
    workflowSha: z.string().regex(/^[a-f0-9]{40}$/),
    runId: z.string().regex(/^\d+$/),
    runAttempt: z.number().int().positive(),
    sentAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export function buildGitHubDelivery(options: BuildDeliveryOptions) {
  const identity = githubRunIdentitySchema.safeParse({
    repository: options.repository,
    workflowRef: options.workflowRef,
    workflowSha: options.workflowSha,
    runId: options.runId,
    runAttempt: options.runAttempt,
    sentAt: options.sentAt,
  });
  if (!identity.success) throw new Error("invalid GitHub run identity");
  if (options.kind === "snapshot") {
    const snapshot = githubSnapshotSchema.safeParse(options.payload);
    if (!snapshot.success || !githubSnapshotHashesMatch(snapshot.data)) {
      throw new Error("invalid GitHub snapshot");
    }
    if (snapshot.data.collectionStatus !== "complete" || hasRequiredEvidenceFailure(snapshot.data)) {
      throw new Error("incomplete snapshot cannot be delivered");
    }
  }
  return {
    schemaVersion: 1 as const,
    kind: options.kind,
    deliveryId: `github-delivery:${options.runId}.${options.runAttempt}`,
    ...identity.data,
    payloadHash: sha256(canonicalJson(options.payload)),
    payload: options.payload,
  };
}

export async function deliverGitHubEvidence(options: {
  endpoint: string;
  secret: string;
  delivery: ReturnType<typeof buildGitHubDelivery>;
  fetch?: (request: Request) => Promise<Response>;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  const fetchRequest = options.fetch ?? fetch;
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const rawBody = canonicalJson(options.delivery);
  const signature = signGitHubDelivery(rawBody, options.secret);
  const attempted = await runWithBoundedRetries(
    () => fetchRequest(new Request(options.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-portfolio-signature": signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(20_000),
      })),
    (response) => response.status === 429 || response.status >= 500,
    { maxAttempts: 3, initialDelayMs: 250, wait },
  );
  if (attempted.error) throw new Error("github-delivery-unavailable");
  if (!attempted.value?.ok) throw new Error(`delivery-rejected:${attempted.value?.status ?? "unavailable"}`);
  return await attempted.value.json() as unknown;
}
