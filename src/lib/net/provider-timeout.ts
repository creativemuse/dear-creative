export const DEFAULT_PROVIDER_CALL_TIMEOUT_MS = 30_000;

export class ProviderCallTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Provider call timed out after ${timeoutMs}ms`);
    this.name = "ProviderCallTimeoutError";
  }
}

export async function withProviderTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const timeoutPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      reject(new ProviderCallTimeoutError(timeoutMs));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([operation(signal), timeoutPromise]);
}
