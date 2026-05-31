import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { recordCaseEvent } from '../../services/caseEvents.js';
import { hasFeature } from '../../services/entitlements.js';
import { assertClientCaseAccess } from '../../services/portalAccess.js';
import { createSignedUrl } from '../../services/storage.js';
import { sendClientPasswordResetEmail } from '../../services/email.js';
import {
  clientSignIn,
  clientRefresh,
  clientSignOut,
  acceptClientInvite,
  clientResetPasswordRequest,
  clientResetPasswordConfirm,
  clientVerifyOtp,
  clientResendOtp,
  verifyClientAccessToken,
} from '../../services/clientPortalAuth.js';

// ── Rate limiting (mirrors authRoutes.ts) ──────────────────────────────────
// The portal auth surface is unauthenticated and password/token-bearing, so it
// gets the same per-IP / per-email throttling as the staff auth router.
function clientIp(req: Request): string {
  // Require a non-empty value so unknown-IP traffic doesn't all share one
  // rate-limit bucket. Mirrors clientIp() in authRoutes.ts.
  const ip = req.ip || req.socket?.remoteAddress;
  if (!ip) {
    throw new ApiError('Could not determine client IP', 400, 'NO_CLIENT_IP');
  }
  return ip;
}

function enforceRateLimit(identifier: string, max: number, windowMs: number) {
  const result = checkRateLimit(identifier, max, windowMs);
  if (!result.allowed) {
    throw new ApiError(
      `Too many requests. Try again in ${result.retryAfter}s.`,
      429,
      'RATE_LIMITED'
    );
  }
}

// ── Refresh-token cookie helpers (mirrors authRoutes.ts) ───────────────────
// The portal refresh token lives in an httpOnly cookie scoped to the portal
// auth path, so it's never exposed to JS (XSS-safe) and is sent automatically
// on /api/v1/portal/auth/* requests. Mirrors the staff app's `kourti_rt`.

const PORTAL_REFRESH_COOKIE = 'kourti_prt';
const portalIsProduction = env.NODE_ENV === 'production';

/** Parse a JWT-style duration (e.g. "7d", "30m") into seconds. Copied from authRoutes.ts. */
function parseExpiry(val: string): number {
  const match = val.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 604800; // 7 days default
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 3600;
    case 'd':
      return num * 86400;
    default:
      return 604800;
  }
}

const portalRefreshMaxAge = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);

function setPortalRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(PORTAL_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: portalIsProduction,
    sameSite: portalIsProduction ? 'none' : 'lax', // 'none' needed for cross-origin Vercel→Railway
    path: '/api/v1/portal/auth',
    maxAge: portalRefreshMaxAge * 1000,
  });
}

function clearPortalRefreshCookie(res: Response) {
  res.clearCookie(PORTAL_REFRESH_COOKIE, {
    httpOnly: true,
    secure: portalIsProduction,
    sameSite: portalIsProduction ? 'none' : 'lax',
    path: '/api/v1/portal/auth',
  });
}

// ════════════════════════════════════════════════════════════════════════
// Client-facing portal routers.
//
//   portalAuthRouter — PUBLIC. Mounted by keystone at /api/v1/portal/auth
//                      with NO middleware. login/refresh/accept-invite/reset.
//   portalRouter     — Mounted at /api/v1/portal behind `requireClientAuth`
//                      ONLY. Every handler is client-scoped via
//                      req.clientAuth.clientUserId and deny-by-default through
//                      client_case_access. A firm that has downgraded out of
//                      the `client_portal` feature has its matters disappear
//                      from the client's view (per-firm gating).
// ════════════════════════════════════════════════════════════════════════

export const portalAuthRouter = Router();
export const portalRouter = Router();

// ── Auth (public) schemas ────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  fullName: z.string().trim().min(1).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const verifyOtpSchema = z.object({
  otpToken: z.string().min(1),
  code: z.string().min(1),
});

const resendOtpSchema = z.object({
  otpToken: z.string().min(1),
});

// ── POST /login — returns the OTP union (200 with `kind`) ──────────────────

portalAuthRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`portal:login:ip:${clientIp(req)}`, 10, 60_000);
    const { email, password } = loginSchema.parse(req.body);
    enforceRateLimit(`portal:login:email:${email.toLowerCase()}`, 5, 600_000);
    // ClientSignInResult is either { kind:'tokens', ... } or
    // { kind:'otp_required', otpToken, otpTokenExpiresIn, emailHint }.
    const result = await clientSignIn(email, password);
    if (result.kind === 'tokens') {
      // Stash the refresh token in an httpOnly cookie; never expose it to JS.
      setPortalRefreshCookie(res, result.refreshToken);
      const { refreshToken: _omit, ...safe } = result;
      res.status(200).json(safe);
      return;
    }
    res.status(200).json(result);
  })
);

// ── POST /verify-otp — redeem the OTP challenge for session tokens ─────────

portalAuthRouter.post(
  '/verify-otp',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`portal:verify-otp:ip:${clientIp(req)}`, 10, 60_000);
    const { otpToken, code } = verifyOtpSchema.parse(req.body);
    const tokens = await clientVerifyOtp(otpToken, code);
    setPortalRefreshCookie(res, tokens.refreshToken);
    const { refreshToken: _omit, ...safe } = tokens;
    res.status(200).json(safe);
  })
);

// ── POST /resend-otp — re-send the login code for an in-flight challenge ───

portalAuthRouter.post(
  '/resend-otp',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`portal:resend-otp:ip:${clientIp(req)}`, 5, 300_000);
    const { otpToken } = resendOtpSchema.parse(req.body);
    const result = await clientResendOtp(otpToken);
    res.status(200).json(result);
  })
);

// ── POST /refresh ──────────────────────────────────────────────────────────

portalAuthRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`portal:refresh:ip:${clientIp(req)}`, 120, 60_000);
    const parsed = refreshSchema.parse(req.body ?? {});
    // Prefer the httpOnly cookie; fall back to a body token for legacy callers.
    const refreshToken = req.cookies?.[PORTAL_REFRESH_COOKIE] || parsed.refreshToken;
    if (!refreshToken) {
      throw new ApiError('Missing refresh token', 401, 'CLIENT_AUTH_UNAUTHORIZED');
    }
    const tokens = await clientRefresh(refreshToken, {
      ip: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    setPortalRefreshCookie(res, tokens.refreshToken);
    const { refreshToken: _omit, ...safe } = tokens;
    res.status(200).json(safe);
  })
);

// ── POST /accept-invite ──────────────────────────────────────────────────

portalAuthRouter.post(
  '/accept-invite',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`portal:accept-invite:ip:${clientIp(req)}`, 10, 60_000);
    const { token, password, fullName } = acceptInviteSchema.parse(req.body);
    const tokens = await acceptClientInvite(token, password, fullName);
    setPortalRefreshCookie(res, tokens.refreshToken);
    const { refreshToken: _omit, ...safe } = tokens;
    res.status(200).json(safe);
  })
);

// ── POST /forgot-password — always {ok:true} (no enumeration) ─────────────

portalAuthRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`portal:forgot-password:ip:${clientIp(req)}`, 3, 60_000);
    const { email } = forgotPasswordSchema.parse(req.body);
    // Mint/persist a reset token and email the reset link. We NEVER reveal
    // whether the address exists — clientResetPasswordRequest returns the raw
    // token only when the user exists (null otherwise), and we always respond
    // {ok:true} regardless.
    try {
      const token = await clientResetPasswordRequest(email);
      if (token) {
        await sendClientPasswordResetEmail(email, token);
      }
    } catch (err) {
      console.error('[portal] forgot-password failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    res.status(200).json({ ok: true });
  })
);

// ── POST /reset-password ──────────────────────────────────────────────────

portalAuthRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`portal:reset-password:ip:${clientIp(req)}`, 10, 60_000);
    const { token, password } = resetPasswordSchema.parse(req.body);
    await clientResetPasswordConfirm(token, password);
    res.status(200).json({ ok: true });
  })
);

// ── POST /logout — reads bearer ───────────────────────────────────────────

portalAuthRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
    if (bearer) {
      try {
        const user = verifyClientAccessToken(bearer);
        await clientSignOut(user.clientUserId);
      } catch {
        // An invalid/expired token on logout is a no-op — never error.
      }
    }
    clearPortalRefreshCookie(res);
    res.status(200).json({ ok: true });
  })
);

// ════════════════════════════════════════════════════════════════════════
// Authenticated portal (requireClientAuth applied by the app at mount time)
// ════════════════════════════════════════════════════════════════════════

const caseIdParamsSchema = z.object({ caseId: z.string().uuid() });

const postMessageSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

// Access guard lives in services/portalAccess.ts as assertClientCaseAccess
// (deny-by-default + per-firm feature recheck) — one source of truth shared
// by every portal feature router.

// ── GET /me ────────────────────────────────────────────────────────────────

portalRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;

    const result = await db.query<{
      id: string;
      email: string;
      full_name: string | null;
      email_notifications_enabled: boolean;
    }>(
      `select id, email, full_name, email_notifications_enabled from public.client_users where id = $1 limit 1`,
      [clientUserId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError('Client not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      emailNotificationsEnabled: row.email_notifications_enabled,
    });
  })
);

// ── PATCH /me — rectification (Art. 16): client edits their own profile ─────

const updateMeSchema = z.object({
  fullName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional().nullable(),
  emailNotificationsEnabled: z.boolean().optional(),
});

portalRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const body = updateMeSchema.parse(req.body ?? {});
    const result = await db.query<{
      id: string;
      email: string;
      full_name: string | null;
      phone: string | null;
      email_notifications_enabled: boolean;
    }>(
      `update public.client_users
          set full_name = coalesce($2, full_name),
              phone = coalesce($3, phone),
              email_notifications_enabled = coalesce($4, email_notifications_enabled),
              updated_at = now()
        where id = $1
        returning id, email, full_name, phone, email_notifications_enabled`,
      [
        clientUserId,
        body.fullName ?? null,
        body.phone ?? null,
        body.emailNotificationsEnabled ?? null,
      ]
    );
    const row = result.rows[0];
    if (!row) throw new ApiError('Client not found', 404, 'NOT_FOUND');
    res.status(200).json({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      emailNotificationsEnabled: row.email_notifications_enabled,
    });
  })
);

// ── GET /me/export — access + portability (Art. 15/20) ──────────────────────

portalRouter.get(
  '/me/export',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { exportClientData } = await import('../../services/privacy.js');
    const data = await exportClientData(clientUserId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="kourti-portal-data-${clientUserId}.json"`
    );
    res.status(200).send(JSON.stringify(data, null, 2));
  })
);

// ── DELETE /me — erasure (Art. 17). Deletes the portal identity; the firm's
//    contact record is unlinked, not deleted (the firm remains controller). ──

const deleteMeSchema = z.object({ confirm: z.literal('DELETE') });

portalRouter.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    deleteMeSchema.parse(req.body ?? {});
    const { eraseClientUser } = await import('../../services/privacy.js');
    const result = await eraseClientUser(clientUserId);
    res.status(200).json({ erased: true, ...result });
  })
);

// ── GET /matters — list of granted matters, each labeled with the firm ─────

portalRouter.get(
  '/matters',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;

    const result = await db.query<{
      case_id: string;
      title: string;
      client_summary: string | null;
      status: string;
      organization_id: string;
      org_name: string;
      logo_url: string | null;
      last_event_at: string | null;
      unread_messages: number;
    }>(
      `
      select
        c.id as case_id,
        c.title,
        c.client_summary,
        c.status,
        o.id as organization_id,
        o.name as org_name,
        o.logo_url,
        (
          select max(ce.occurred_at)
            from public.case_events ce
           where ce.case_id = c.id and ce.client_visible = true
        ) as last_event_at,
        (
          select count(*)::int
            from public.case_client_messages m
           where m.case_id = c.id
             and m.sender_type = 'staff'
             and m.read_at is null
        ) as unread_messages
      from public.cases c
      join public.organizations o on o.id = c.organization_id
      where (
        exists (
          select 1 from public.client_case_access cca
           where cca.client_user_id = $1
             and cca.case_id = c.id
             and cca.status = 'active'
        )
        or (
          exists (
            select 1 from public.client_portal_access cpa
             where cpa.client_user_id = $1
               and cpa.status = 'active'
               and cpa.client_id = c.client_id
          )
          and not coalesce(c.portal_private, false)
        )
      )
      order by last_event_at desc nulls last, c.title asc
      `,
      [clientUserId]
    );

    // Drop any matter whose firm no longer has the `client_portal` feature.
    // hasFeature is a cached Map lookup, but de-dupe org ids to be safe.
    const orgIds = [...new Set(result.rows.map((r) => r.organization_id))];
    const featureByOrg = new Map<string, boolean>();
    await Promise.all(
      orgIds.map(async (orgId) => {
        featureByOrg.set(orgId, await hasFeature(orgId, 'client_portal'));
      })
    );

    const matters = result.rows
      .filter((r) => featureByOrg.get(r.organization_id))
      .map((r) => ({
        caseId: r.case_id,
        title: r.title,
        clientSummary: r.client_summary,
        status: r.status,
        firm: {
          organizationId: r.organization_id,
          name: r.org_name,
          logoUrl: r.logo_url,
        },
        lastEventAt: r.last_event_at,
        unreadMessages: r.unread_messages,
      }));

    res.status(200).json(matters);
  })
);

// ── GET /matters/:caseId — matter detail ────────────────────────────────────

portalRouter.get(
  '/matters/:caseId',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const { organizationId } = await assertClientCaseAccess(clientUserId, caseId);

    const result = await db.query<{
      id: string;
      title: string;
      client_summary: string | null;
      status: string;
      next_hearing_date: string | null;
      organization_id: string;
      org_name: string;
      logo_url: string | null;
    }>(
      `
      select
        c.id,
        c.title,
        c.client_summary,
        c.status,
        c.next_hearing_date,
        o.id as organization_id,
        o.name as org_name,
        o.logo_url
      from public.cases c
      join public.organizations o on o.id = c.organization_id
      where c.id = $1
        and c.organization_id = $2
      limit 1
      `,
      [caseId, organizationId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError('Matter not found', 404, 'NOT_FOUND');
    }

    res.status(200).json({
      caseId: row.id,
      title: row.title,
      clientSummary: row.client_summary,
      status: row.status,
      nextHearingDate: row.next_hearing_date,
      firm: {
        organizationId: row.organization_id,
        name: row.org_name,
        logoUrl: row.logo_url,
      },
    });
  })
);

// ── GET /matters/:caseId/timeline — client-visible events only ─────────────

portalRouter.get(
  '/matters/:caseId/timeline',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    await assertClientCaseAccess(clientUserId, caseId);

    const result = await db.query<{
      id: string;
      event_type: string;
      title: string | null;
      body: string | null;
      occurred_at: string;
    }>(
      `
      select id, event_type, title, body, occurred_at
        from public.case_events
       where case_id = $1 and client_visible = true
       order by occurred_at desc
      `,
      [caseId]
    );

    res.status(200).json(
      result.rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        title: r.title,
        body: r.body,
        occurredAt: r.occurred_at,
      }))
    );
  })
);

// ── GET /matters/:caseId/documents — docs shared to the client ─────────────

portalRouter.get(
  '/matters/:caseId/documents',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const { organizationId } = await assertClientCaseAccess(clientUserId, caseId);

    // A document is "shared" to the client when staff flip `client_visible`
    // true (and emit a document_shared event). The case↔document link lives in
    // documents.metadata->>'case_id' (no documents.case_id column here).
    const result = await db.query<{
      id: string;
      name: string;
      mime_type: string | null;
      file_size: string | null;
      file_path: string | null;
      created_at: string;
    }>(
      `
      select d.id, d.name, d.mime_type, d.file_size, d.file_path, d.created_at
        from public.documents d
       where d.metadata->>'case_id' = $1
         and d.organization_id = $2
         and d.client_visible = true
         and d.deleted_at is null
       order by d.created_at desc
      `,
      [caseId, organizationId]
    );

    // Mint a real 15-min signed download URL per file. The signed-URL flow is
    // audience-bound to the matter's organizationId.
    res.status(200).json(
      result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        mimeType: r.mime_type,
        fileSize: r.file_size != null ? Number(r.file_size) : null,
        createdAt: r.created_at,
        downloadUrl: r.file_path
          ? createSignedUrl('documents', r.file_path, 900, organizationId)
          : null,
      }))
    );
  })
);

// ── GET /matters/:caseId/messages — thread asc; mark staff msgs read ───────

portalRouter.get(
  '/matters/:caseId/messages',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const { organizationId } = await assertClientCaseAccess(clientUserId, caseId);

    const result = await db.query<{
      id: string;
      sender_type: string;
      sender_id: string;
      body: string;
      read_at: string | null;
      created_at: string;
    }>(
      `
      select id, sender_type, sender_id, body, read_at, created_at
        from public.case_client_messages
       where case_id = $1
         and organization_id = $2
       order by created_at asc
      `,
      [caseId, organizationId]
    );

    // Mark unread staff messages as read now that the client has fetched them.
    await db.query(
      `update public.case_client_messages
          set read_at = now()
        where case_id = $1 and organization_id = $2 and sender_type = 'staff' and read_at is null`,
      [caseId, organizationId]
    );

    res.status(200).json(
      result.rows.map((r) => ({
        id: r.id,
        senderType: r.sender_type,
        senderId: r.sender_id,
        body: r.body,
        readAt: r.read_at,
        createdAt: r.created_at,
      }))
    );
  })
);

// ── POST /matters/:caseId/messages — client posts a message ─────────────────

portalRouter.post(
  '/matters/:caseId/messages',
  asyncHandler(async (req, res) => {
    const { clientUserId } = req.clientAuth!;
    const { caseId } = caseIdParamsSchema.parse(req.params);
    const { body } = postMessageSchema.parse(req.body);
    const { organizationId } = await assertClientCaseAccess(clientUserId, caseId);

    const result = await db.query<{
      id: string;
      sender_type: string;
      sender_id: string;
      body: string;
      read_at: string | null;
      created_at: string;
    }>(
      `
      insert into public.case_client_messages
        (case_id, organization_id, sender_type, sender_id, body)
      values ($1, $2, 'client', $3, $4)
      returning id, sender_type, sender_id, body, read_at, created_at
      `,
      [caseId, organizationId, clientUserId, body]
    );

    const row = result.rows[0];

    // Best-effort event emission — recordCaseEvent never throws.
    await recordCaseEvent({
      organizationId,
      caseId,
      eventType: 'client_message',
      title: 'New message from client',
      clientVisible: true,
      actorType: 'client',
      actorId: clientUserId,
    });

    res.status(201).json({
      id: row.id,
      senderType: row.sender_type,
      senderId: row.sender_id,
      body: row.body,
      readAt: row.read_at,
      createdAt: row.created_at,
    });
  })
);
