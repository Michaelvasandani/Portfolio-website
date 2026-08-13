import type { OwnerAccessRuntime } from "./auth/runtime";
import { isOperationalSection } from "./operations";
import {
  concealedPrivateResponse,
  csrfCookie,
  expiredCookie,
  oauthStateCookie,
  ownerSessionCookie,
  privateResponseHeaders,
  safeOperationalView,
  type SecureCookie,
} from "./security";

type RuntimeReader = () => OwnerAccessRuntime;

function noStoreHeaders(contentType: string): HeadersInit {
  return {
    ...privateResponseHeaders,
    "Content-Type": contentType,
  };
}

function unavailableResponse(): Response {
  return new Response("Owner access is unavailable.", {
    status: 503,
    headers: noStoreHeaders("text/plain; charset=utf-8"),
  });
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
  }
  return cookies;
}

function serializedCookie(cookie: SecureCookie): string {
  const sameSite = cookie.options.sameSite[0]!.toUpperCase() + cookie.options.sameSite.slice(1);
  return [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    `Max-Age=${cookie.options.maxAge}`,
    `Path=${cookie.options.path}`,
    "HttpOnly",
    "Secure",
    `SameSite=${sameSite}`,
    "Priority=High",
  ].join("; ");
}

function appendCookie(headers: Headers, cookie: SecureCookie): void {
  headers.append("Set-Cookie", serializedCookie(cookie));
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { ...noStoreHeaders("text/plain; charset=utf-8"), Location: location },
  });
}

export class OwnerAccessHttpController {
  constructor(private readonly runtime: RuntimeReader) {}

  async start(): Promise<Response> {
    const runtime = this.runtime();
    if (!runtime.available) return unavailableResponse();
    try {
      const login = await runtime.service.beginLogin();
      const response = redirectResponse(login.authorizationUrl);
      appendCookie(
        response.headers,
        oauthStateCookie(login.stateBinding, runtime.configuration.oauthLifetimeSeconds),
      );
      return response;
    } catch {
      return unavailableResponse();
    }
  }

  async callback(request: Request): Promise<Response> {
    const runtime = this.runtime();
    if (!runtime.available) return unavailableResponse();
    const url = new URL(request.url);
    const cookies = parseCookies(request.headers.get("cookie"));
    try {
      const login = await runtime.service.completeLogin({
        code: url.searchParams.get("code") ?? "",
        state: url.searchParams.get("state") ?? "",
        stateBinding: cookies.get("__Host-portfolio-oauth") ?? "",
      });
      const response = redirectResponse(`${runtime.configuration.publicOrigin}/control`);
      appendCookie(
        response.headers,
        ownerSessionCookie(login.sessionToken, runtime.configuration.sessionLifetimeSeconds),
      );
      appendCookie(response.headers, csrfCookie(login.csrfToken, runtime.configuration.sessionLifetimeSeconds));
      appendCookie(response.headers, expiredCookie("__Host-portfolio-oauth"));
      return response;
    } catch {
      const response = redirectResponse(`${runtime.configuration.publicOrigin}/owner-access?status=denied`);
      appendCookie(response.headers, expiredCookie("__Host-portfolio-oauth"));
      return response;
    }
  }

  async logout(request: Request): Promise<Response> {
    const runtime = this.runtime();
    if (!runtime.available) return concealedPrivateResponse();
    try {
      const cookies = parseCookies(request.headers.get("cookie"));
      const form = await request.formData();
      const csrfToken = String(form.get("csrfToken") ?? "");
      if (csrfToken !== (cookies.get("__Host-portfolio-csrf") ?? "")) {
        return concealedPrivateResponse();
      }
      await runtime.service.logout({
        sessionToken: cookies.get("__Host-portfolio-session") ?? "",
        csrfToken,
        origin: request.headers.get("origin"),
      });
      const response = redirectResponse(`${runtime.configuration.publicOrigin}/owner-access?status=logged-out`);
      appendCookie(response.headers, expiredCookie("__Host-portfolio-session"));
      appendCookie(response.headers, expiredCookie("__Host-portfolio-csrf"));
      return response;
    } catch {
      return concealedPrivateResponse();
    }
  }

  async status(request: Request, section: string): Promise<Response> {
    if (!isOperationalSection(section)) return concealedPrivateResponse();
    const runtime = this.runtime();
    if (!runtime.available) return concealedPrivateResponse();
    try {
      const cookies = parseCookies(request.headers.get("cookie"));
      await runtime.service.verifySession(cookies.get("__Host-portfolio-session") ?? "");
      const view = await runtime.operations.read(section);
      return Response.json(safeOperationalView(view), {
        headers: noStoreHeaders("application/json; charset=utf-8"),
      });
    } catch {
      return concealedPrivateResponse();
    }
  }

  async command(request: Request): Promise<Response> {
    const runtime = this.runtime();
    if (!runtime.available) return concealedPrivateResponse();
    try {
      const cookies = parseCookies(request.headers.get("cookie"));
      const form = await request.formData();
      const csrfToken = String(form.get("csrfToken") ?? "");
      await runtime.service.authorizeMutation({
        sessionToken: cookies.get("__Host-portfolio-session") ?? "",
        csrfToken,
        origin: request.headers.get("origin"),
      });
      const action = String(form.get("action") ?? "");
      if (action !== "retry" && action !== "restore" && action !== "clear-breaker") return concealedPrivateResponse();
      const targetId = String(form.get("targetId") ?? "").trim() || null;
      const reason = String(form.get("reason") ?? "").trim();
      if ((action === "retry" || action === "restore") && !targetId) return concealedPrivateResponse();
      if (action === "restore" && reason.length < 8) return concealedPrivateResponse();
      await runtime.controls.execute({ action, targetId, reason, actor: "owner" });
      const section = action === "retry" ? "publication-runs" : action === "restore" ? "restore-retry" : "breaker";
      return redirectResponse(`${runtime.configuration.publicOrigin}/control/${section}?command=accepted`);
    } catch {
      return concealedPrivateResponse();
    }
  }
}
