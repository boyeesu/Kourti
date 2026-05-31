/**
 * Per-org feature overrides — a grant/revoke layer that sits ABOVE the
 * plan_features matrix (services/entitlements.ts). Lets an admin force a single
 * feature on or off for one organization without editing the plan: sales
 * trials, beta access, incident workarounds.
 *
 *   mode='grant'  → feature is ON  regardless of plan
 *   mode='revoke' → feature is OFF regardless of plan
 *
 * Rows with a past expires_at are ignored. Cached in-memory with a short TTL,
 * mirroring entitlements.ts, so the hot path stays a Map lookup.
 */
import { db } from '../db/pool.js';
import type { FeatureKey } from './entitlements.js';

export type OverrideMode = 'grant' | 'revoke';

const CACHE_TTL_MS = 30_000;
let cache: { at: number; map: Map<string, Map<string, OverrideMode>> } | null = null;

async function loadOverrides(): Promise<Map<string, Map<string, OverrideMode>>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.map;

  const map = new Map<string, Map<string, OverrideMode>>();
  try {
    const res = await db.query<{
      organization_id: string;
      feature_key: string;
      mode: OverrideMode;
    }>(
      `select organization_id, feature_key, mode
         from public.feature_overrides
        where expires_at is null or expires_at > now()`
    );
    for (const row of res.rows) {
      if (!map.has(row.organization_id)) map.set(row.organization_id, new Map());
      map.get(row.organization_id)!.set(row.feature_key, row.mode);
    }
  } catch {
    // Table missing/unavailable — no overrides, fall through to plan matrix.
  }

  cache = { at: now, map };
  return map;
}

export function invalidateFeatureOverridesCache(): void {
  cache = null;
}

/**
 * The override decision for one org+feature, or null when no active override
 * applies. true = force-on, false = force-off.
 */
export async function featureOverrideDecision(
  orgId: string,
  feature: FeatureKey
): Promise<boolean | null> {
  const map = await loadOverrides();
  const mode = map.get(orgId)?.get(feature);
  if (mode === 'grant') return true;
  if (mode === 'revoke') return false;
  return null;
}

/** All active overrides for an org, as { granted, revoked } feature lists. */
export async function orgOverrides(
  orgId: string
): Promise<{ granted: string[]; revoked: string[] }> {
  const map = await loadOverrides();
  const forOrg = map.get(orgId);
  const granted: string[] = [];
  const revoked: string[] = [];
  if (forOrg) {
    for (const [feature, mode] of forOrg) {
      (mode === 'grant' ? granted : revoked).push(feature);
    }
  }
  return { granted, revoked };
}
