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
