export const DEFAULT_PROVIDER_CALL_TIMEOUT_MS = 30_000;

export class ProviderCallTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Provider call timed out after ${timeoutMs}ms`);
    this.name = "ProviderCallTimeoutError";
  }
}

export async function withProviderTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = DEFAULT_PROVIDER_CALL_TIMEOUT_MS,
): Promise<T> {
  const { promise, dispose } = awaitableWithAbortTimeout(timeoutMs);
  try {
    return await Promise.race([operation(), promise]);
  } finally {
    dispose();
  }
}

function awaitableWithAbortTimeout(timeoutMs: number): {
  promise: Promise<never>;
  dispose: () => void;
} {
  const signal = AbortSignal.timeout(timeoutMs);
  let rejectRef: ((reason: Error) => void) | undefined;
  const promise = new Promise<never>((_, reject) => {
    rejectRef = reject;
    const onAbort = () => {
      reject(new ProviderCallTimeoutError(timeoutMs));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    promise,
    dispose: () => {
      rejectRef = undefined;
    },
  };
}
