/**
 * Platform-admin impersonation ("View as").
 *
 * Starting a session writes an audit row (public.impersonation_sessions) and
 * mints a short-lived access token that authenticates AS the target user but
 * carries the session id in its `imp` claim. authenticateRequest re-checks the
 * session is still active on every request, so ending the row instantly revokes
 * access. Read-only is the default and the only scope platform_support may use;
 * write scope requires the impersonate.write capability.
 *
 * Only staff (firm-user) targets are supported today. Client-portal
 * impersonation uses a different token surface and is tracked separately.
 */
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';
import type { Request } from 'express';

import { signImpersonationAccessToken } from './jwt.js';
import { recordAdminAction } from './adminAudit.js';

// Sessions are deliberately short — long enough to reproduce an issue, short
// enough to limit blast radius. Admin must re-start to continue.
const SESSION_TTL_SECONDS = 30 * 60;

export interface StartImpersonationInput {
  adminUserId: string;
  targetUserId: string;
  scope: 'read' | 'write';
  reason: string;
  req?: Request;
}

export interface StartedImpersonation {
  sessionId: string;
  token: string;
  expiresIn: number;
  target: { id: string; email: string; organizationId: string };
}

export async function startImpersonation(
  input: StartImpersonationInput
): Promise<StartedImpersonation> {
  const target = await db.query<{
    id: string;
    email: string;
    organization_id: string | null;
    is_active: boolean;
  }>(
    `select au.id, au.email, au.is_active, p.organization_id
       from public.auth_users au
       left join public.profiles p on p.user_id = au.id
      where au.id = $1
      limit 1`,
    [input.targetUserId]
  );
  const row = target.rows[0];
  if (!row) throw new ApiError('Target user not found', 404, 'NOT_FOUND');

  // Refuse to impersonate another platform admin — that's a privilege-escalation
  // path (a support agent could "View as" a superadmin and inherit nothing here,
  // since the token is the target's, but it's still a sensitive surface).
  const targetIsAdmin = await db.query<{ exists: boolean }>(
    `select exists(
       select 1 from public.user_role_assignments
        where user_id = $1
          and role_name in ('platform_admin','platform_support','platform_billing')
     ) as exists`,
    [input.targetUserId]
  );
  if (targetIsAdmin.rows[0]?.exists) {
    throw new ApiError('Cannot impersonate another platform admin', 403, 'FORBIDDEN');
  }

  const organizationId = row.organization_id ?? '';

  const inserted = await db.query<{ id: string; expires_at: string }>(
    `insert into public.impersonation_sessions
       (admin_user_id, target_type, target_user_id, target_organization_id,
        scope, reason, ip_address, user_agent, expires_at)
     values ($1,'staff',$2,$3,$4,$5,$6,$7, now() + make_interval(secs => $8))
     returning id, expires_at`,
    [
      input.adminUserId,
      input.targetUserId,
      row.organization_id,
      input.scope,
      input.reason,
      input.req?.ip ?? null,
      input.req?.get('user-agent') ?? null,
      SESSION_TTL_SECONDS,
    ]
  );
  const sessionId = inserted.rows[0].id;

  const token = signImpersonationAccessToken(
    { id: row.id, email: row.email, organizationId },
    { sid: sessionId, by: input.adminUserId, scope: input.scope },
    SESSION_TTL_SECONDS
  );

  await recordAdminAction({
    adminUserId: input.adminUserId,
    actionType: 'impersonation.start',
    targetType: 'user',
    targetId: input.targetUserId,
    reason: input.reason,
    details: { scope: input.scope, sessionId, organizationId },
    req: input.req,
  });

  return {
    sessionId,
    token,
    expiresIn: SESSION_TTL_SECONDS,
    target: { id: row.id, email: row.email, organizationId },
  };
}

/** End a session. `endedBy` is the admin (or the impersonator themselves). */
export async function endImpersonation(
  sessionId: string,
  endedBy: string,
  req?: Request
): Promise<void> {
  const result = await db.query<{ admin_user_id: string; target_user_id: string }>(
    `update public.impersonation_sessions
        set ended_at = now(), ended_by = $2
      where id = $1 and ended_at is null
      returning admin_user_id, target_user_id`,
    [sessionId, endedBy]
  );
  if (!result.rows[0]) return; // already ended / unknown — idempotent

  await recordAdminAction({
    adminUserId: endedBy,
    actionType: 'impersonation.end',
    targetType: 'user',
    targetId: result.rows[0].target_user_id,
    details: { sessionId },
    req,
  });
}

export async function listActiveSessions() {
  const result = await db.query(
    `select s.id, s.admin_user_id, s.target_user_id, s.target_organization_id,
            s.scope, s.reason, s.created_at, s.expires_at,
            admin.email as admin_email,
            target.email as target_email,
            o.name as organization_name
       from public.impersonation_sessions s
       left join public.auth_users admin on admin.id = s.admin_user_id
       left join public.auth_users target on target.id = s.target_user_id
       left join public.organizations o on o.id = s.target_organization_id
      where s.ended_at is null and s.expires_at > now()
      order by s.created_at desc`
  );
  return result.rows;
}
