import { db } from '../db/pool.js';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  resetAt: number;
};

// In-memory store, used as a synchronous fast-path AND as the fail-open
// fallback when the DB is unreachable. The AUTHORITATIVE counter, however,
// is public.rate_limits (created by bootstrap.ts): a single atomic
// INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 keyed by
// (identifier, window) so concurrent instances share one counter.
//
// Because callers use checkRateLimit() synchronously (its result is consumed
// inline, never awaited), the function returns the in-memory decision
// immediately and reconciles against the shared DB counter asynchronously.
// When the DB reports the window is over its cap, we stamp the in-memory entry
// so subsequent calls on this instance block right away — converging every
// instance onto the shared authoritative count within one request.
const memoryStore = new Map<string, { count: number; resetAt: number }>();

// DB-store availability with a cooldown circuit breaker. A single DB error no
// longer disables the shared counter for the whole process lifetime (a brief
// blip would permanently degrade distributed limiting to per-instance memory).
// Instead we back off for DB_STORE_COOLDOWN_MS, fall back to in-memory in the
// interim, then re-attempt the DB store after the cooldown elapses.
const DB_STORE_COOLDOWN_MS = 30_000;
// Timestamp (ms) until which the DB store is considered unavailable. 0 = healthy.
let dbStoreUnavailableUntil = 0;

/** True when the DB store should be attempted (healthy, or cooldown elapsed). */
function dbStoreReady(now: number): boolean {
  return dbStoreUnavailableUntil === 0 || now >= dbStoreUnavailableUntil;
}

/**
 * Derive a stable window key so each fixed window gets its own row. The window
 * start is floored to windowMs, folded into the key, so the existing
 * single-column `key` schema (key text primary key) needs no migration.
 */
function windowKey(
  identifier: string,
  windowMs: number,
  now: number
): { key: string; resetAt: number } {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return { key: `rl:${identifier}:${windowStart}`, resetAt: windowStart + windowMs };
}

export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const { key, resetAt } = windowKey(identifier, windowMs, now);
  const current = memoryStore.get(key);

  // Fast in-memory decision for this instance. The window is encoded in the
  // key, so an expired window simply maps to a different (absent) key.
  let count: number;
  if (!current || current.resetAt < now) {
    count = 1;
    memoryStore.set(key, { count, resetAt });
  } else {
    count = current.count + 1;
    memoryStore.set(key, { count, resetAt });
  }

  // Reconcile against the shared atomic counter in the background. This makes
  // the DB the authoritative cross-instance counter while keeping this call
  // synchronous; on DB error we fail open and keep the in-memory decision.
  reconcileWithDb(key, resetAt, maxRequests);

  if (count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      resetAt,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - count),
    retryAfter: 0,
    resetAt,
  };
}

/**
 * Atomic, distributed increment. A single statement increments the shared
 * counter for (key, window) and returns the authoritative count. If that count
 * has exceeded the cap, we stamp the in-memory entry so this instance blocks
 * immediately on the next call even if its local count was lower.
 */
function reconcileWithDb(key: string, resetAt: number, maxRequests: number) {
  const now = Date.now();
  if (!dbStoreReady(now)) return;
  // A prior cooldown has elapsed — clear it and re-attempt the DB store. If this
  // attempt also fails the .catch() below re-arms the cooldown.
  if (dbStoreUnavailableUntil !== 0) {
    dbStoreUnavailableUntil = 0;
  }
  db.query<{ count: number }>(
    `INSERT INTO public.rate_limits (key, count, reset_at)
     VALUES ($1, 1, to_timestamp($2 / 1000.0))
     ON CONFLICT (key) DO UPDATE SET count = public.rate_limits.count + 1
     RETURNING count`,
    [key, resetAt]
  )
    .then((res) => {
      const authoritative = res.rows[0]?.count;
      if (typeof authoritative === 'number') {
        const entry = memoryStore.get(key);
        // Converge local view onto the shared count so subsequent calls on
        // this instance enforce the global limit.
        if (!entry || entry.resetAt < Date.now()) {
          memoryStore.set(key, { count: authoritative, resetAt });
        } else if (authoritative > entry.count) {
          entry.count = authoritative;
          memoryStore.set(key, entry);
        }
        // Once over cap, make sure the in-memory entry reflects it.
        if (authoritative > maxRequests) {
          const e = memoryStore.get(key);
          if (e) {
            e.count = Math.max(e.count, authoritative);
            memoryStore.set(key, e);
          }
        }
      }
    })
    .catch((err) => {
      // Back off for a cooldown window instead of disabling permanently. During
      // the cooldown we fail open to in-memory (preserving availability); once it
      // elapses the next call re-attempts the DB store. Only log on the leading
      // edge (transition from healthy → unavailable) to avoid log spam.
      // NOTE: alert on this warn in your log pipeline — sustained occurrences
      // mean cross-replica limiting is degraded (see VAPT M10).
      if (dbStoreUnavailableUntil === 0) {
        console.warn(
          `[rateLimit] DB counter unavailable, falling back to in-memory for ${DB_STORE_COOLDOWN_MS}ms:`,
          err?.message ?? err
        );
      }
      dbStoreUnavailableUntil = Date.now() + DB_STORE_COOLDOWN_MS;
    });
}

/**
 * Hydrate in-memory store from DB on startup (call once from app init).
 * This ensures rate limits survive restarts.
 */
export async function hydrateRateLimits() {
  if (!dbStoreReady(Date.now())) return;
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
