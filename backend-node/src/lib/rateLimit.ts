type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(identifier: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const key = `rl:${identifier}`;
  const current = store.get(key);

  if (!current || current.resetAt < now) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      retryAfter: 0,
      resetAt: next.resetAt,
    };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((current.resetAt - now) / 1000),
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  store.set(key, current);

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - current.count),
    retryAfter: 0,
    resetAt: current.resetAt,
  };
}
