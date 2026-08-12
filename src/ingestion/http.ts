import "server-only";

import { z } from "zod";

import { privateResponseHeaders } from "../control/security";
import type { CareerIngestionRuntime } from "./runtime";
import { CareerIngestionError } from "./service";

const uploadIntentRequestSchema = z
  .object({
    filename: z.string().min(1).max(120),
    declaredType: z.string().min(1).max(120),
    size: z.number().int().positive(),
    expectedHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

const uploadCompletionRequestSchema = z
  .object({
    intentId: z.string().regex(/^upload:[A-Za-z0-9_-]+$/),
    objectKey: z.string().regex(/^raw-career\/upload:[A-Za-z0-9_-]+\/[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/),
  })
  .strict();

type CareerIngestionHttpControllerDependencies = {
  authorize(request: Request): Promise<void>;
  runtime(): CareerIngestionRuntime;
};

type AvailableCareerIngestionRuntime = Extract<CareerIngestionRuntime, { available: true }>;

function privateText(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      ...privateResponseHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function privateJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: privateResponseHeaders });
}

export class CareerIngestionHttpController {
  readonly #dependencies: CareerIngestionHttpControllerDependencies;

  constructor(dependencies: CareerIngestionHttpControllerDependencies) {
    this.#dependencies = dependencies;
  }

  async #authorizedRuntime(request: Request): Promise<AvailableCareerIngestionRuntime | Response> {
    try {
      await this.#dependencies.authorize(request);
    } catch {
      return privateText("", 404);
    }
    const runtime = this.#dependencies.runtime();
    if (!runtime.available) return privateText("Career ingestion is unavailable.", 503);
    return runtime;
  }

  async issue(request: Request): Promise<Response> {
    const runtime = await this.#authorizedRuntime(request);
    if (runtime instanceof Response) return runtime;
    let input: z.infer<typeof uploadIntentRequestSchema>;
    try {
      input = uploadIntentRequestSchema.parse(await request.json());
    } catch {
      return privateText("Upload request is invalid.", 400);
    }
    try {
      return privateJson(await runtime.service.issueUpload(input), 201);
    } catch (error) {
      if (error instanceof CareerIngestionError) {
        return privateJson({ code: error.code, message: error.message }, 422);
      }
      return privateText("Career ingestion is unavailable.", 503);
    }
  }

  async complete(request: Request): Promise<Response> {
    const runtime = await this.#authorizedRuntime(request);
    if (runtime instanceof Response) return runtime;
    let input: z.infer<typeof uploadCompletionRequestSchema>;
    try {
      input = uploadCompletionRequestSchema.parse(await request.json());
    } catch {
      return privateText("Upload completion request is invalid.", 400);
    }
    try {
      return privateJson(await runtime.service.completeUpload(input), 200);
    } catch (error) {
      if (error instanceof CareerIngestionError) {
        return privateJson({ code: error.code, message: error.message }, 422);
      }
      return privateText("Career ingestion is unavailable.", 503);
    }
  }

  async maintain(request: Request): Promise<Response> {
    const runtime = await this.#authorizedRuntime(request);
    if (runtime instanceof Response) return runtime;
    try {
      return privateJson(await runtime.maintenance.run(), 200);
    } catch {
      return privateText("Career ingestion maintenance is unavailable.", 503);
    }
  }

  async status(request: Request): Promise<Response> {
    const runtime = await this.#authorizedRuntime(request);
    if (runtime instanceof Response) return runtime;
    try {
      return privateJson(await runtime.maintenance.status(), 200);
    } catch {
      return privateText("Career ingestion status is unavailable.", 503);
    }
  }
}
