export async function runWithBoundedRetries<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (value: T) => boolean,
  options: {
    maxAttempts: number;
    initialDelayMs: number;
    wait: (milliseconds: number) => Promise<void>;
  },
): Promise<{ value: T | null; error: unknown | null; attempts: number }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const value = await operation(attempt);
      if (!shouldRetry(value) || attempt === options.maxAttempts) {
        return { value, error: null, attempts: attempt };
      }
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts) {
        return { value: null, error: lastError, attempts: attempt };
      }
    }
    await options.wait(options.initialDelayMs * 2 ** (attempt - 1));
  }
  throw new Error("bounded retry exhausted without result");
}
