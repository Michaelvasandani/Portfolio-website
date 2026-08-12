import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";

import { getOwnerAccessRuntime } from "./auth/runtime.server";
import type { OperationalSectionSlug, OperationalShellView } from "./operations";
import { safeOperationalView } from "./security";

export type OwnerControlContext = {
  csrfToken: string;
};

export async function readOwnerControlContext(): Promise<OwnerControlContext | null> {
  await connection();
  const runtime = getOwnerAccessRuntime();
  if (!runtime.available) return null;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("__Host-portfolio-session")?.value ?? "";
  const csrfToken = cookieStore.get("__Host-portfolio-csrf")?.value ?? "";
  if (!csrfToken) return null;
  try {
    await runtime.service.verifySession(sessionToken);
    return { csrfToken };
  } catch {
    return null;
  }
}

export async function readOperationalView(
  slug: OperationalSectionSlug,
): Promise<OperationalShellView | null> {
  const context = await readOwnerControlContext();
  if (!context) return null;
  const runtime = getOwnerAccessRuntime();
  if (!runtime.available) return null;
  try {
    return safeOperationalView(await runtime.operations.read(slug));
  } catch {
    const section = (await import("./operations")).operationalSections.find((entry) => entry.slug === slug)!;
    return {
      slug,
      label: section.label,
      state: "error",
      summary: "Operational state could not be read. No success is assumed.",
      records: [],
    };
  }
}
