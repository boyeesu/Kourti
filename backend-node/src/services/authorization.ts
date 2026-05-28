import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';

export async function isPlatformAdminUser(userId: string) {
  if (env.AUTH_MODE === 'development') {
    return true;
  }

  const result = await db.query<{ exists: boolean }>(
    `
    select exists (
      select 1
      from public.user_role_assignments ura
      where ura.user_id = $1
        and ura.role_name = 'platform_admin'
    ) as exists
    `,
    [userId]
  );

  return Boolean(result.rows[0]?.exists);
}

export async function requirePlatformAdminUser(userId: string) {
  const allowed = await isPlatformAdminUser(userId);
  if (!allowed) {
    throw new ApiError('Forbidden', 403, 'FORBIDDEN');
  }
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
  if (env.AUTH_MODE === 'development') return true;

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
