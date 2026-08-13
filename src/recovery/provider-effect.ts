import { AmbiguousProviderResultError } from "../publication/contracts";

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export async function reconcileProviderEffect<T>(input: {
  read(): Promise<T | null>;
  apply(): Promise<T>;
}): Promise<T> {
  const existing = await input.read();
  if (existing) return existing;
  try {
    return await input.apply();
  } catch (error) {
    if (!(error instanceof AmbiguousProviderResultError)) throw error;
    const reconciled = await input.read();
    if (!reconciled) throw error;
    return reconciled;
  }
}
