type Bucket = {
  count: number;
  windowStartedAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  now?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = options.now ?? Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStartedAt >= options.windowMs) {
    buckets.set(key, { count: 1, windowStartedAt: now });
    return {
      allowed: true,
      remaining: options.limit - 1,
      retryAfterMs: 0,
    };
  }

  if (bucket.count >= options.limit) {
    const retryAfterMs = options.windowMs - (now - bucket.windowStartedAt);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: options.limit - bucket.count,
    retryAfterMs: 0,
  };
}

export function resetRateLimitStoreForTests(): void {
  buckets.clear();
}
