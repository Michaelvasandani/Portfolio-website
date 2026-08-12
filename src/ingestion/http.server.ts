import "server-only";

import { getOwnerAccessRuntime } from "../control/auth/runtime.server";
import { CareerIngestionHttpController } from "./http";
import { getCareerIngestionRuntime } from "./runtime.server";

function cookieValue(request: Request, name: string): string {
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

export const careerIngestionHttp = new CareerIngestionHttpController({
  runtime: getCareerIngestionRuntime,
  async authorize(request) {
    const ownerRuntime = getOwnerAccessRuntime();
    if (!ownerRuntime.available) throw new Error("Owner access is unavailable.");
    await ownerRuntime.service.authorizeMutation({
      sessionToken: cookieValue(request, "__Host-portfolio-session"),
      csrfToken: request.headers.get("x-csrf-token") ?? "",
      origin: request.headers.get("origin"),
    });
  },
});
