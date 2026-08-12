import "server-only";

import { createCareerIngestionRuntime, type CareerIngestionRuntime } from "./runtime";

const runtimeKey = Symbol.for("agentic-portfolio.career-ingestion-runtime");
type RuntimeGlobal = typeof globalThis & { [runtimeKey]?: CareerIngestionRuntime };

export function getCareerIngestionRuntime(): CareerIngestionRuntime {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  runtimeGlobal[runtimeKey] ??= createCareerIngestionRuntime(process.env);
  return runtimeGlobal[runtimeKey];
}
