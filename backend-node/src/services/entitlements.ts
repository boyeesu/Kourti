/**
 * Plan-based feature entitlements.
 *
 * The source of truth at runtime is the `public.plan_features` table
 * (plan_type, feature_key, enabled) — admin-editable, seeded in bootstrap
 * from DEFAULT_PLAN_FEATURES below. We cache it in-memory (short TTL) so the
 * per-request `hasFeature` check is a Map lookup, not a query.
 *
 * Tiers (default): Starter = core case/doc/contract management + basic AI.
 * Professional adds the automation suite. Enterprise adds SSO.
 *
 * Trial rule: a `trialing` org is treated as **professional** so the trial
 * showcases the premium features (it would be pointless to trial Starter-only).
 */
import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { isPlatformAdminUser } from './authorization.js';

// Core features every paid plan (and trial) gets.
const CORE = [
  'cases',
  'clients',
  'calendar',
  'documents',
  'contracts',
  'search',
  'invoices',
  'voice',
  'chat',
  'ai_review',
] as const;

// Automation suite — Professional and up.
const AUTOMATION = [
  'agents',
  'negotiations',
  'intelligence',
  'playbooks',
  'tabular_review',
  'redline',
] as const;

export const FEATURE_KEYS = [...CORE, ...AUTOMATION, 'sso'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Default plan → enabled-feature mapping. Used to seed `plan_features`. */
export const DEFAULT_PLAN_FEATURES: Record<string, FeatureKey[]> = {
  starter: [...CORE],
  professional: [...CORE, ...AUTOMATION],
  enterprise: [...CORE, ...AUTOMATION, 'sso'],
};

// ── In-memory cache of the plan_features table ──────────────────────────────

const CACHE_TTL_MS = 60_000;
let cache: { at: number; map: Map<string, Set<string>> } | null = null;

async function loadMatrix(): Promise<Map<string, Set<string>>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.map;

  const map = new Map<string, Set<string>>();
  try {
    const res = await db.query<{ plan_type: string; feature_key: string }>(
      `select plan_type, feature_key from public.plan_features where enabled = true`
    );
    for (const row of res.rows) {
      if (!map.has(row.plan_type)) map.set(row.plan_type, new Set());
      map.get(row.plan_type)!.add(row.feature_key);
    }
  } catch {
    // Table missing/unavailable — fall back to the code defaults so the app
    // fails open to the documented matrix rather than blocking everything.
  }
  if (map.size === 0) {
    for (const [plan, keys] of Object.entries(DEFAULT_PLAN_FEATURES)) {
      map.set(plan, new Set(keys));
    }
  }

  cache = { at: now, map };
  return map;
}

/** Test/admin helper — drop the cache so the next read re-queries. */
export function invalidateEntitlementsCache(): void {
  cache = null;
}

/**
 * The plan tier whose entitlements apply to this org. Trials map to
 * `professional`. Returns null when the org has no live subscription.
 * Exported for the limits service (services/limits.ts).
 */
export async function effectivePlanType(orgId: string): Promise<string | null> {
  const res = await db.query<{ status: string; plan_type: string | null }>(
    `select s.status, up.plan_type
       from public.subscriptions s
       left join public.user_plans up on up.id = s.plan_id
      where s.organization_id = $1
        and s.status in ('active','trialing','past_due')
      order by s.created_at desc
      limit 1`,
    [orgId]
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.status === 'trialing') return 'professional';
  return row.plan_type;
}

/**
 * Does this org's plan include `feature`? Platform admins and development
 * mode are always allowed.
 */
export async function hasFeature(
  orgId: string,
  feature: FeatureKey,
  userId?: string
): Promise<boolean> {
  if (env.AUTH_MODE === 'development') return true;
  if (userId && (await isPlatformAdminUser(userId))) return true;

  const planType = await effectivePlanType(orgId);
  if (!planType) return false;

  const matrix = await loadMatrix();
  return matrix.get(planType)?.has(feature) ?? false;
}

/**
 * The org's effective plan + the full set of enabled feature keys — for the
 * frontend to gate UI. Platform admins / dev get everything.
 */
export async function getEntitlements(
  orgId: string,
  userId?: string
): Promise<{ plan_type: string | null; features: FeatureKey[] }> {
  if (env.AUTH_MODE === 'development' || (userId && (await isPlatformAdminUser(userId)))) {
    return { plan_type: 'enterprise', features: [...FEATURE_KEYS] };
  }

  const planType = await effectivePlanType(orgId);
  if (!planType) return { plan_type: null, features: [] };

  const matrix = await loadMatrix();
  const enabled = matrix.get(planType) ?? new Set<string>();
  return {
    plan_type: planType,
    features: FEATURE_KEYS.filter((k) => enabled.has(k)),
  };
}
