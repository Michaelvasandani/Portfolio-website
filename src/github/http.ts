import { GitHubDeliveryRejection } from "./receiver";
import type { GitHubIngestionRuntime } from "./runtime";

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

class RequestBodyRejection extends Error {
  constructor(readonly reason: "payload-too-large" | "body-timeout", readonly status: 413 | 408) {
    super(reason);
  }
}

async function readRequestBody(request: Request, maxBytes: number, timeoutMs: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new RequestBodyRejection("body-timeout", 408)), timeoutMs);
  });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), timedOut]);
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes) throw new RequestBodyRejection("payload-too-large", 413);
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export class GitHubIngestionHttpController {
  readonly #maxBodyBytes: number;
  readonly #bodyReadTimeoutMs: number;

  constructor(
    readonly getRuntime: () => GitHubIngestionRuntime,
    options: { maxBodyBytes?: number; bodyReadTimeoutMs?: number } = {},
  ) {
    this.#maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
    this.#bodyReadTimeoutMs = options.bodyReadTimeoutMs ?? 5_000;
  }

  async post(request: Request): Promise<Response> {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
      return json({ status: "rejected", reason: "unsupported-media-type" }, 415);
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    const signature = request.headers.get("x-portfolio-signature") ?? "";
    try {
      if (declaredLength > this.#maxBodyBytes) throw new RequestBodyRejection("payload-too-large", 413);
      const rawBody = await readRequestBody(request, this.#maxBodyBytes, this.#bodyReadTimeoutMs);
      const runtime = this.getRuntime();
      if (runtime.status === "unavailable") return json({ status: "unavailable" }, 503);
      const result = await runtime.receiver.receive({ rawBody, signature });
      return json(result, result.status === "installed" ? 201 : 200);
    } catch (error) {
      if (error instanceof RequestBodyRejection) {
        return json({ status: "rejected", reason: error.reason }, error.status);
      }
      if (error instanceof GitHubDeliveryRejection) {
        return json({ status: "rejected", reason: error.reason }, error.status);
      }
      return json({ status: "unavailable" }, 503);
    }
  }
}
