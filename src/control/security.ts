import type { OperationalShellView } from "./operations";

const privilegedField = /(?:\bid\b|access|refresh|session|oauth|csrf|api|client|private|credential|secret|password|database|blob|vercel|resend|evidenceGraph|manifest|diagnostic|endpoint|token|key)/i;
const privilegedValue = /(?:\bBearer\s+[A-Za-z0-9._~-]+|\bgh[opusr]_[A-Za-z0-9_]{20,}\b|postgres(?:ql)?:\/\/|\b(?:vercel_blob_rw_|re_)[A-Za-z0-9_-]{16,})/i;

type CookieOptions = {
  httpOnly: true;
  secure: true;
  sameSite: "lax" | "strict";
  path: "/";
  maxAge: number;
  priority: "high";
};

export type SecureCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export const privateResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export function oauthStateCookie(value: string, maxAge: number): SecureCookie {
  return {
    name: "__Host-portfolio-oauth",
    value,
    options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge, priority: "high" },
  };
}

export function ownerSessionCookie(value: string, maxAge: number): SecureCookie {
  return {
    name: "__Host-portfolio-session",
    value,
    options: { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge, priority: "high" },
  };
}

export function csrfCookie(value: string, maxAge: number): SecureCookie {
  return {
    name: "__Host-portfolio-csrf",
    value,
    options: { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge, priority: "high" },
  };
}

export function expiredCookie(name: SecureCookie["name"]): SecureCookie {
  return {
    name,
    value: "",
    options: { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0, priority: "high" },
  };
}

export function concealedPrivateResponse(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      ...privateResponseHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export function safeOperationalView(view: OperationalShellView): OperationalShellView {
  return {
    slug: view.slug,
    label: view.label,
    state: view.state,
    summary: view.summary,
    records: view.records.map((record) => ({
      label: record.label,
      value: privilegedField.test(record.label)
        ? "[redacted]"
        : String(redactPrivilegedFields(record.value)),
    })),
  };
}

export function redactPrivilegedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPrivilegedFields);
  if (typeof value === "string" && privilegedValue.test(value)) return "[redacted]";
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      privilegedField.test(key) ? "[redacted]" : redactPrivilegedFields(child),
    ]),
  );
}
