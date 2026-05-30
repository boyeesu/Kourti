/**
 * Plan usage limits (tiered caps).
 *
 * Companion to entitlements.ts: where entitlements answer "can this plan use
 * feature X (boolean)", limits answer "how much can it use (numeric cap)".
 *
 * Source of truth at runtime is `public.plan_limits` (plan_type, limit_key,
 * limit_value) — admin-editable, seeded from DEFAULT_PLAN_LIMITS in bootstrap.
 * A missing row (or null value) means **unlimited** for that key. Cached
 * in-memory with a short TTL like the entitlements matrix.
 *
 * Trial orgs inherit `professional` (via effectivePlanType). Platform admins
 * and development mode are always unlimited.
 */
import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';
import { isPlatformAdminUser } from './authorization.js';
import { effectivePlanType } from './entitlements.js';

export const LIMIT_KEYS = [
  'cases',
  'clients',
  'storage_mb',
  'ai_reviews_month',
  'ai_messages_month',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/**
 * Default caps per plan_type. Finite number = cap; omitted key = unlimited.
 * Enterprise omits everything (all unlimited). Used to seed plan_limits and as
 * the fallback when the table is unavailable.
 */
export const DEFAULT_PLAN_LIMITS: Record<string, Partial<Record<LimitKey, number>>> = {
  starter: {
    cases: 50,
    clients: 200,
    storage_mb: 10_240, // 10 GB
    ai_reviews_month: 50,
    ai_messages_month: 300,
  },
  professional: {
    cases: 500,
    storage_mb: 102_400, // 100 GB
    ai_reviews_month: 1_000,
    ai_messages_month: 3_000,
  },
  enterprise: {},
};

// ── In-memory cache of the plan_limits table ────────────────────────────────

const CACHE_TTL_MS = 60_000;
let cache: { at: number; map: Map<string, Map<string, number>> } | null = null;

async function loadMatrix(): Promise<Map<string, Map<string, number>>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.map;

  const map = new Map<string, Map<string, number>>();
  try {
    const res = await db.query<{ plan_type: string; limit_key: string; limit_value: string | null }>(
      `select plan_type, limit_key, limit_value
         from public.plan_limits
        where limit_value is not null`
    );
    for (const row of res.rows) {
      if (!map.has(row.plan_type)) map.set(row.plan_type, new Map());
      map.get(row.plan_type)!.set(row.limit_key, Number(row.limit_value));
    }
  } catch {
    // Table missing/unavailable — fall back to the code defaults.
  }
  if (map.size === 0) {
    for (const [plan, limits] of Object.entries(DEFAULT_PLAN_LIMITS)) {
      const m = new Map<string, number>();
      for (const [k, v] of Object.entries(limits)) m.set(k, v as number);
      map.set(plan, m);
    }
  }

  cache = { at: now, map };
  return map;
}

/** Test/admin helper — drop the cache so the next read re-queries. */
export function invalidateLimitsCache(): void {
  cache = null;
}

/** Cap for (planType, key). Returns null when unlimited (no row). */
async function capFor(planType: string, key: LimitKey): Promise<number | null> {
  const matrix = await loadMatrix();
  return matrix.get(planType)?.get(key) ?? null;
}

async function isUnlimitedActor(userId?: string): Promise<boolean> {
  if (env.AUTH_MODE === 'development') return true;
  if (userId && (await isPlatformAdminUser(userId))) return true;
  return false;
}

/** The org's effective caps (null = unlimited per key) — for display/usage UI. */
export async function getLimits(
  orgId: string,
  userId?: string
): Promise<Record<LimitKey, number | null>> {
  const out = Object.fromEntries(LIMIT_KEYS.map((k) => [k, null])) as Record<
    LimitKey,
    number | null
  >;
  if (await isUnlimitedActor(userId)) return out;

  const planType = await effectivePlanType(orgId);
  if (!planType) return out;

  const matrix = await loadMatrix();
  const m = matrix.get(planType);
  if (m) {
    for (const k of LIMIT_KEYS) {
      const v = m.get(k);
      if (v != null) out[k] = v;
    }
  }
  return out;
}

/**
 * Enforce a count cap. `currentCount` is existing usage; throws 409
 * PLAN_LIMIT_REACHED when creating one more would exceed the cap. Unlimited
 * plans, platform admins and dev mode pass through.
 */
export async function enforceCountLimit(
  orgId: string,
  key: LimitKey,
  currentCount: number,
  label: string,
  userId?: string
): Promise<void> {
  if (await isUnlimitedActor(userId)) return;
  const planType = await effectivePlanType(orgId);
  if (!planType) return;

  const cap = await capFor(planType, key);
  if (cap == null) return; // unlimited

  if (currentCount >= cap) {
    throw new ApiError(
      `You've reached your plan's limit of ${cap.toLocaleString()} ${label}. Upgrade your plan to add more.`,
      409,
      'PLAN_LIMIT_REACHED'
    );
  }
}

/**
 * Enforce the document-storage cap (stored in MB). Throws 409 when the new
 * upload would push the org's total document bytes over the cap.
 */
export async function enforceStorageLimit(
  orgId: string,
  currentBytes: number,
  addBytes: number,
  userId?: string
): Promise<void> {
  if (await isUnlimitedActor(userId)) return;
  const planType = await effectivePlanType(orgId);
  if (!planType) return;

  const capMb = await capFor(planType, 'storage_mb');
  if (capMb == null) return; // unlimited

  const capBytes = capMb * 1024 * 1024;
  if (currentBytes + addBytes > capBytes) {
    const gb = capMb % 1024 === 0 ? String(capMb / 1024) : (capMb / 1024).toFixed(1);
    throw new ApiError(
      `You've reached your plan's ${gb} GB document storage limit. Upgrade your plan for more storage.`,
      409,
      'PLAN_LIMIT_REACHED'
    );
  }
}
