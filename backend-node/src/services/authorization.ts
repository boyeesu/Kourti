import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';

/**
 * Platform-admin capability model.
 *
 * The historical single 'platform_admin' role is the all-powerful superadmin.
 * On top of it we layer two scoped staff roles so support and billing staff can
 * be granted just what they need:
 *
 *   platform_admin   → superadmin (every capability)
 *   platform_support → read-only platform access + read-only impersonation
 *   platform_billing → read + billing/plans/credits/feature-overrides
 *
 * New admin endpoints gate on a capability via requireAdminCapability(); legacy
 * endpoints keep using requirePlatformAdminUser() which now means "superadmin".
 */
export const ADMIN_CAPABILITIES = [
  'platform.read', // view orgs, users, analytics, audit, system health
  'users.manage', // approve / disable / delete users, bulk ops
  'billing.manage', // plans, subscriptions, credits, feature overrides
  'impersonate.read', // start a read-only "view as" session
  'impersonate.write', // start a read-write impersonation session
  'storage.manage', // storage scan / sweep / restore
  'content.manage', // marketing KB (MARTHA) + email tooling
  'rules.manage', // lifecycle automation rules
  'superadmin', // everything; create/delete orgs; grant admin roles
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

const SUPERADMIN_CAPS = new Set<AdminCapability>(ADMIN_CAPABILITIES);

const ROLE_CAPABILITIES: Record<string, Set<AdminCapability>> = {
  platform_admin: SUPERADMIN_CAPS,
  platform_support: new Set(['platform.read', 'impersonate.read']),
  platform_billing: new Set(['platform.read', 'billing.manage']),
};

/**
 * Only treat the environment as a true dev bypass when BOTH AUTH_MODE and
 * NODE_ENV say development. The env validator already forbids
 * production+AUTH_MODE=development, but this also closes staging/preview envs
 * that might set AUTH_MODE=development with a non-dev NODE_ENV and would
 * otherwise silently grant everyone superadmin. Mirrors services/auth.ts.
 */
function isDevBypass(): boolean {
  return env.AUTH_MODE === 'development' && env.NODE_ENV === 'development';
}

/**
 * The full capability set for a user, derived from their platform role
 * assignments. Dev bypass grants every capability.
 */
export async function getAdminCapabilities(userId: string): Promise<Set<AdminCapability>> {
  if (isDevBypass()) return new Set(SUPERADMIN_CAPS);

  const result = await db.query<{ role_name: string }>(
    `select distinct role_name
       from public.user_role_assignments
      where user_id = $1
        and role_name in ('platform_admin','platform_support','platform_billing')`,
    [userId]
  );

  const caps = new Set<AdminCapability>();
  for (const row of result.rows) {
    const roleCaps = ROLE_CAPABILITIES[row.role_name];
    if (roleCaps) for (const c of roleCaps) caps.add(c);
  }
  return caps;
}

export async function hasAdminCapability(
  userId: string,
  capability: AdminCapability
): Promise<boolean> {
  const caps = await getAdminCapabilities(userId);
  return caps.has(capability);
}

/** Any platform staff role at all — used to gate access to the /thanos panel. */
export async function isPlatformStaff(userId: string): Promise<boolean> {
  const caps = await getAdminCapabilities(userId);
  return caps.size > 0;
}

/**
 * Backward-compatible superadmin check. Existing destructive endpoints call
 * this; it now resolves to the 'superadmin' capability so scoped support/billing
 * staff can NOT reach those endpoints unless explicitly migrated to a narrower
 * capability.
 */
export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  return hasAdminCapability(userId, 'superadmin');
}

export async function requirePlatformAdminUser(userId: string): Promise<void> {
  if (!(await isPlatformAdminUser(userId))) {
    throw new ApiError('Forbidden', 403, 'FORBIDDEN');
  }
}

/** Throw 403 unless the user holds `capability`. */
export async function requireAdminCapabilityFor(
  userId: string,
  capability: AdminCapability
): Promise<void> {
  if (!(await hasAdminCapability(userId, capability))) {
    throw new ApiError('Forbidden', 403, 'FORBIDDEN');
  }
}

/**
 * Express middleware form: gate a route on an admin capability. Runs after
 * requireAuth so req.auth is present.
 */
export function requireAdminCapability(capability: AdminCapability) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = req.auth;
      if (!auth) throw new ApiError('Authentication required', 401, 'AUTH_REQUIRED');
      await requireAdminCapabilityFor(auth.userId, capability);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Returns true when the user can take org-wide actions on the given org —
 * either they hold a privileged role assignment for it, OR they are the
 * sole member (the org creator coming straight out of onboarding, before
 * any role rows exist).
 */
export async function isOrgAdminOrSoleMember(
  userId: string,
  organizationId: string
): Promise<boolean> {
  if (isDevBypass()) return true;

  const roleResult = await db.query<{ exists: boolean }>(
    `
    select exists (
      select 1
      from public.user_role_assignments ura
      where ura.user_id = $1
        and ura.organization_id = $2
        and ura.role_name in ('admin','superadmin','owner','platform_admin')
    ) as exists
    `,
    [userId, organizationId]
  );
  if (roleResult.rows[0]?.exists) return true;

  const sole = await db.query<{ count: string }>(
    `select count(*)::text as count from public.profiles where organization_id = $1`,
    [organizationId]
  );
  return Number(sole.rows[0]?.count ?? '0') <= 1;
}
