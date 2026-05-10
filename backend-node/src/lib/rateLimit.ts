import { db } from '../db/pool.js';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  resetAt: number;
};

// In-memory fallback for the same instance. The authoritative table is
// public.rate_limits, created by bootstrap.ts. We sync from in-memory to
// DB asynchronously so a single hot path stays synchronous.
const memoryStore = new Map<string, { count: number; resetAt: number }>();

let useDbStore = true;

export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  // Use synchronous in-memory check, then sync to DB in background
  const now = Date.now();
  const key = `rl:${identifier}`;
  const current = memoryStore.get(key);

  if (!current || current.resetAt < now) {
    const next = { count: 1, resetAt: now + windowMs };
    memoryStore.set(key, next);
    syncToDb(key, next.count, next.resetAt);
    return { allowed: true, remaining: maxRequests - 1, retryAfter: 0, resetAt: next.resetAt };
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
  memoryStore.set(key, current);
  syncToDb(key, current.count, current.resetAt);

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - current.count),
    retryAfter: 0,
    resetAt: current.resetAt,
  };
}

function syncToDb(key: string, count: number, resetAt: number) {
  if (!useDbStore) return;
  db.query(
    `INSERT INTO public.rate_limits (key, count, reset_at)
     VALUES ($1, $2, to_timestamp($3 / 1000.0))
     ON CONFLICT (key) DO UPDATE SET count = $2, reset_at = to_timestamp($3 / 1000.0)`,
    [key, count, resetAt]
  ).catch((err) => {
    // First failure flips us to in-memory-only; we already log loudly
    // because bootstrap should have created the table.
    if (useDbStore) {
      console.warn('[rateLimit] DB sync failed, falling back to in-memory:', err?.message ?? err);
      useDbStore = false;
    }
  });
}

/**
 * Hydrate in-memory store from DB on startup (call once from app init).
 * This ensures rate limits survive restarts.
 */
export async function hydrateRateLimits() {
  if (!useDbStore) return;
  try {
    const result = await db.query<{ key: string; count: number; reset_at: string }>(
      `SELECT key, count, extract(epoch from reset_at) * 1000 as reset_at
       FROM public.rate_limits
       WHERE reset_at > now()`
    );
    for (const row of result.rows) {
      memoryStore.set(row.key, {
        count: row.count,
        resetAt: Number(row.reset_at),
      });
    }
  } catch {
    // Non-critical
  }
}
