import "server-only";

import { createOwnerAccessRuntime, type OwnerAccessRuntime } from "./runtime";

const runtimeKey = Symbol.for("agentic-portfolio.owner-access-runtime");
type RuntimeGlobal = typeof globalThis & { [runtimeKey]?: OwnerAccessRuntime };

export function getOwnerAccessRuntime(): OwnerAccessRuntime {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  runtimeGlobal[runtimeKey] ??= createOwnerAccessRuntime(process.env);
  return runtimeGlobal[runtimeKey];
}
