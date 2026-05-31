import type { Request } from 'express';

import { db } from '../db/pool.js';

/**
 * Central writer for the `security_events` table — the SOC 2 / CC7 security
 * audit feed. Every security-relevant action (authentication, MFA changes,
 * privilege changes, deletions, bulk exports, signed-URL abuse) should funnel
 * through here so we have one tamper-relevant, queryable record of who did what,
 * when, and from where.
 *
 * Writes are best-effort and MUST NEVER throw into the caller's request path:
 * a logging failure must not break the user-facing operation. Failures are
 * surfaced to stderr for ops visibility.
 *
 * The underlying table (see db/bootstrap.ts) has fixed columns plus a `details`
 * jsonb. We map the common actor/target fields onto real columns and fold the
 * rest (user agent, target, extra context) into `details` so no schema change
 * is required.
 */

export type SecurityEventType =
  // Authentication & session
  | 'login_success'
  | 'login_failed'
  | 'login_blocked' // rate-limited / locked out
  | 'logout'
  | 'token_refreshed'
  | 'token_reuse_detected'
  | 'access_revoked' // token epoch bumped (logout-all / password change / disable)
  // Credentials & MFA
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'mfa_challenge_failed'
  | 'recovery_code_used'
  // Authorization / account lifecycle
  | 'role_changed'
  | 'user_status_changed'
  | 'invitation_sent'
  // Data lifecycle (tenant-side actions the admin trail doesn't capture)
  | 'document_deleted'
  | 'document_exported'
  | 'document_downloaded'
  | 'case_deleted'
  | 'client_deleted'
  | 'bulk_export';

export type SecuritySeverity = 'info' | 'warning' | 'critical';

export interface SecurityEventInput {
  eventType: SecurityEventType;
  severity?: SecuritySeverity; // default 'info'
  actorUserId?: string | null;
  actorType?: string | null; // 'user' | 'client' | 'admin' | 'system'; default 'user'
  organizationId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** Arbitrary extra context. Do NOT put secrets/tokens/passwords here. */
  details?: Record<string, unknown> | null;
}

/**
 * Pull actor/ip/ua context off an Express request so call sites stay terse.
 * Works for both staff (`req.auth`) and unauthenticated/failed-auth requests.
 */
export function eventContextFromRequest(
  req: Request
): Pick<SecurityEventInput, 'actorUserId' | 'organizationId' | 'ip' | 'userAgent'> {
  const auth = (req as Request & { auth?: { userId?: string; organizationId?: string } }).auth;
  return {
    actorUserId: auth?.userId ?? null,
    organizationId: auth?.organizationId ?? null,
    ip: clientIp(req),
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0]!.trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export async function logSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const details: Record<string, unknown> = { ...(input.details ?? {}) };
    if (input.userAgent) details.user_agent = input.userAgent;
    if (input.targetType) details.target_type = input.targetType;
    if (input.targetId) details.target_id = input.targetId;

    await db.query(
      `INSERT INTO public.security_events
         (event_type, severity, actor_type, actor_id, organization_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.eventType,
        input.severity ?? 'info',
        input.actorType ?? 'user',
        input.actorUserId ?? null,
        input.organizationId ?? null,
        input.ip ?? null,
        JSON.stringify(details),
      ]
    );
  } catch (err) {
    // Never let audit logging break the request it is observing.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[securityEvents] failed to record ${input.eventType}: ${msg}`);
  }
}
