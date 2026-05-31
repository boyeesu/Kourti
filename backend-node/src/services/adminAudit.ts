/**
 * Central writer for the platform-admin audit trail (public.admin_actions).
 *
 * Every mutating admin action should funnel through recordAdminAction so the
 * trail is consistent: who did it, what they touched, why, and a before/after
 * snapshot for reconstruction. Destructive, billing, and impersonation actions
 * MUST pass a reason — callers enforce that at the route layer.
 */
import type { Request } from 'express';

import { db } from '../db/pool.js';

export interface AdminActionInput {
  adminUserId: string;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  details?: Record<string, unknown>;
  /** When present, IP + user-agent are captured from the request. */
  req?: Request;
}

export async function recordAdminAction(input: AdminActionInput): Promise<string | null> {
  try {
    const result = await db.query<{ id: string }>(
      `insert into public.admin_actions
         (admin_user_id, action_type, target_type, target_id, details,
          reason, before_state, after_state, ip_address, user_agent)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10)
       returning id`,
      [
        input.adminUserId,
        input.actionType,
        input.targetType,
        input.targetId ?? null,
        JSON.stringify(input.details ?? {}),
        input.reason ?? null,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        input.req?.ip ?? null,
        input.req?.get('user-agent') ?? null,
      ]
    );
    return result.rows[0]?.id ?? null;
  } catch (err) {
    // Audit must never break the action it records. Log loudly instead.
    console.error(
      'recordAdminAction failed:',
      err instanceof Error ? err.message : err,
      `(action=${input.actionType} target=${input.targetType}:${input.targetId ?? ''})`
    );
    return null;
  }
}
