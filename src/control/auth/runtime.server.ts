import "server-only";

import { createOwnerAccessRuntime, type OwnerAccessRuntime } from "./runtime";
import type { OwnerAccessStore } from "./store";
import type { OperationalControls, OperationalRepository } from "../operations";

const runtimeKey = Symbol.for("agentic-portfolio.owner-access-runtime");
type RuntimeGlobal = typeof globalThis & { [runtimeKey]?: OwnerAccessRuntime };
const resourcesKey = Symbol.for("agentic-portfolio.owner-access-runtime-resources");
type RuntimeResources = { authStore: OwnerAccessStore; operations: OperationalRepository; controls: OperationalControls; source: Record<string, string | undefined> };
type ResourceGlobal = typeof globalThis & { [resourcesKey]?: RuntimeResources };

export function installOwnerAccessRuntimeResources(
  resources: Omit<RuntimeResources, "source">,
  source: Record<string, string | undefined> = process.env,
): void {
  const globalResources = globalThis as RuntimeGlobal & ResourceGlobal;
  globalResources[resourcesKey] = { ...resources, source };
  delete globalResources[runtimeKey];
}

export function getOwnerAccessRuntime(): OwnerAccessRuntime {
  const runtimeGlobal = globalThis as RuntimeGlobal & ResourceGlobal;
  const resources = runtimeGlobal[resourcesKey];
  runtimeGlobal[runtimeKey] ??= resources
    ? createOwnerAccessRuntime(resources.source, resources.authStore, resources.operations, resources.controls)
    : createOwnerAccessRuntime(process.env);
  return runtimeGlobal[runtimeKey];
}
