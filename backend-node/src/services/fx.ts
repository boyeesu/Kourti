/**
 * Foreign-exchange rate lookup with caching and fail-open fallback.
 *
 * Source: open.er-api.com (no API key, free tier).
 *
 * Why cache: an FX call sits on every /initiate-payment request. We
 * never want the FX provider's latency or quota to block a checkout.
 *
 * Why fail-open to env: the upstream API has gone down. If we fail
 * closed we block all paid checkouts; if we fail open with the env
 * `USD_NGN_FALLBACK_RATE` we charge a slightly stale rate which is the
 * lesser evil. The fallback is mandatory in production (`config/env.ts`
 * defaults to 1600 but you should set it explicitly).
 *
 * After the markup we apply at the call site, a slightly stale rate is
 * still safe — markup absorbs minutes-to-hours of drift.
 */
import { env } from '../config/env.js';

const FX_API_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const REQUEST_TIMEOUT_MS = 4_000;

interface CacheEntry {
  rate: number;
  fetchedAt: number;
  source: 'live' | 'fallback';
}

const cache: Map<string, CacheEntry> = new Map();

export interface FxLookup {
  /** 1 USD = `rate` of target currency. */
  rate: number;
  /** Where this rate came from. `fallback` means the API was unreachable. */
  source: 'live' | 'cached' | 'fallback';
  /** ms-since-epoch we fetched this. */
  fetchedAt: number;
}

/**
 * Get the live USD → NGN rate (with cache + fallback). Always resolves —
 * never throws — so callers can use it on the hot checkout path.
 */
export async function getUsdNgnRate(): Promise<FxLookup> {
  const cached = cache.get('NGN');
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return { rate: cached.rate, source: 'cached', fetchedAt: cached.fetchedAt };
  }

  const live = await fetchUsdNgnLive();
  if (live != null) {
    cache.set('NGN', { rate: live, fetchedAt: now, source: 'live' });
    return { rate: live, source: 'live', fetchedAt: now };
  }

  // Live lookup failed. If we have ANY cached value — even expired — use
  // it over the env fallback (a 6-hour-stale live rate beats a 6-month-
  // stale env rate).
  if (cached) {
     
    console.warn('[fx] live lookup failed; serving stale cached rate', {
      ageSec: Math.round((now - cached.fetchedAt) / 1000),
    });
    return { rate: cached.rate, source: 'cached', fetchedAt: cached.fetchedAt };
  }

   
  console.warn('[fx] live lookup failed; serving env fallback rate', {
    fallback: env.USD_NGN_FALLBACK_RATE,
  });
  cache.set('NGN', {
    rate: env.USD_NGN_FALLBACK_RATE,
    fetchedAt: now,
    source: 'fallback',
  });
  return { rate: env.USD_NGN_FALLBACK_RATE, source: 'fallback', fetchedAt: now };
}

async function fetchUsdNgnLive(): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(FX_API_URL, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const json = (await res.json().catch(() => null)) as {
      result?: string;
      rates?: Record<string, number>;
    } | null;

    if (json?.result !== 'success') return null;
    const ngn = json.rates?.NGN;
    if (typeof ngn !== 'number' || !Number.isFinite(ngn) || ngn <= 0) return null;
    return ngn;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test helper — never call in production code paths. */
export function _resetFxCacheForTests(): void {
  cache.clear();
}
