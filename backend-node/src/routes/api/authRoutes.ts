import crypto from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { ApiError } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  signIn,
  signUp,
  verifyTotpChallenge,
  verifyRecoveryChallenge,
  verifyEmailOtpChallenge,
  resendEmailOtpChallenge,
  startTotpEnrolment,
  confirmTotpEnrolment,
  disableTotp,
  setEmailOtpEnabled,
  getEmailOtpEnabled,
  signOut,
  refreshTokens,
  changePassword,
  resetPasswordRequest,
  resetPasswordConfirm,
  bumpTokenVersion,
} from '../../services/jwt.js';
import { sendPasswordResetEmail } from '../../services/email.js';
import { logSecurityEvent, eventContextFromRequest } from '../../services/securityEvents.js';
import { db } from '../../db/pool.js';
import type { Response } from 'express';

// ── Cookie helpers ──────────────────────────────────────────────────────────

const REFRESH_COOKIE = 'kourti_rt';
const isProduction = env.NODE_ENV === 'production';

function setRefreshCookie(res: Response, refreshToken: string, maxAgeSeconds: number) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax', // 'none' needed for cross-origin Vercel→Railway
    path: '/api/v1/auth',
    maxAge: maxAgeSeconds * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/v1/auth',
  });
}

// ── Rate limit helper ───────────────────────────────────────────────────────

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

// ── Schemas ─────────────────────────────────────────────────────────────────

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Password policy: min 12 characters per NIST SP 800-63B guidance.
// Length over complexity — research shows complexity rules push users
// toward weaker, predictable patterns.
const PASSWORD_MIN = 12;
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(256);

const signUpSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

const resetRequestSchema = z.object({
  email: z.string().email(),
});

const resetConfirmSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

// ── Refresh token expiry in seconds (for cookie maxAge) ─────────────────────

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

const refreshMaxAge = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * Resolve the client IP. We require a non-empty value so that all
 * unknown-IP traffic doesn't share the same `'unknown'` rate-limit
 * bucket. Behind Railway/Cloudflare `req.ip` honors `trust proxy: 1`.
 */
function clientIp(req: import('express').Request): string {
  const ip = req.ip || req.socket.remoteAddress;
  if (!ip) {
    throw new ApiError('Could not determine client IP', 400, 'NO_CLIENT_IP');
  }
  return ip;
}

export const authRouter = Router();

authRouter.post(
  '/sign-in',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    // Per-IP limit catches casual brute force.
    enforceRateLimit(`auth:sign-in:ip:${ip}`, 10, 60_000);

    // Per-email limit catches credential stuffing across rotating IPs.
    // Lower limit, longer window. Rate-limit BEFORE schema parsing so a
    // malformed-email payload can't be used to bypass the email limit.
    const emailFromBody =
      typeof req.body?.email === 'string' ? req.body.email.toLowerCase().slice(0, 254) : null;
    if (emailFromBody) {
      enforceRateLimit(`auth:sign-in:email:${emailFromBody}`, 5, 600_000);
    }

    const { email, password } = signInSchema.parse(req.body);
    const eventCtx = eventContextFromRequest(req);
    const result = await signIn(email, password, eventCtx);

    if (result.kind === 'mfa_required') {
      // 2FA enabled — caller must redeem this token at /2fa/verify-totp,
      // /2fa/verify-email, or /2fa/verify-recovery (depending on method)
      // to receive session tokens.
      res.status(200).json({
        mfaRequired: true,
        mfaToken: result.mfaToken,
        expiresIn: result.mfaTokenExpiresIn,
        method: result.method,
        emailHint: result.emailHint,
      });
      return;
    }

    setRefreshCookie(res, result.refreshToken, refreshMaxAge);
    res.status(200).json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  })
);

authRouter.post(
  '/sign-up',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    enforceRateLimit(`auth:sign-up:ip:${ip}`, 5, 60_000); // 5 sign-ups per minute per IP

    // Per-email signup limit prevents email-bombing victims with
    // unsolicited "verify your email" messages by iterating addresses
    // from rotating IPs. Lower limit, longer window.
    const emailFromBody =
      typeof req.body?.email === 'string' ? req.body.email.toLowerCase().slice(0, 254) : null;
    if (emailFromBody) {
      enforceRateLimit(`auth:sign-up:email:${emailFromBody}`, 3, 3_600_000); // 3/hr/email
    }

    const { email, password, firstName, lastName } = signUpSchema.parse(req.body);
    const result = await signUp(email, password, { firstName, lastName });

    // Fresh sign-ups always require email OTP verification — that's
    // what proves the address is real and blocks typo'd entries.
    if (result.kind === 'mfa_required') {
      res.status(200).json({
        mfaRequired: true,
        mfaToken: result.mfaToken,
        expiresIn: result.mfaTokenExpiresIn,
        method: result.method,
        emailHint: result.emailHint,
      });
      return;
    }

    // Unreachable today — signUp() always returns mfa_required for fresh
    // signups, so the welcome email + Brevo sync live in
    // verifyEmailOtpChallenge (jwt.ts). If a no-MFA signup path is ever
    // added, route it through the same first-confirm gate there rather
    // than re-introducing duplicate side effects here.
    setRefreshCookie(res, result.refreshToken, refreshMaxAge);
    res.status(201).json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  })
);

// ── 2FA / TOTP ──────────────────────────────────────────────────────

const totpChallengeSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(1).max(20),
});

const enrolConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const disableTotpSchema = z.object({
  currentPassword: z.string().min(1),
});

const emailOtpChallengeSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(4).max(8).regex(/^\d+$/),
});

const resendEmailOtpSchema = z.object({ mfaToken: z.string().min(1) });

const toggleEmailOtpSchema = z.object({
  enabled: z.boolean(),
  currentPassword: z.string().min(1),
});

// Public — redeem the short-lived MFA token from /sign-in for session tokens.
authRouter.post(
  '/2fa/verify-totp',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    enforceRateLimit(`auth:2fa:ip:${ip}`, 10, 60_000);
    const { mfaToken, code } = totpChallengeSchema.parse(req.body);
    const tokens = await verifyTotpChallenge(mfaToken, code, eventContextFromRequest(req));
    setRefreshCookie(res, tokens.refreshToken, refreshMaxAge);
    res.status(200).json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  })
);

// Public — redeem the email OTP for session tokens. Used by both the
// post-signin login flow and the post-signup verification flow; the
// purpose is carried inside the signed mfaToken so the client can't
// upgrade a signup challenge into a different flow.
authRouter.post(
  '/2fa/verify-email',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    enforceRateLimit(`auth:2fa-email:ip:${ip}`, 10, 60_000);
    const { mfaToken, code } = emailOtpChallengeSchema.parse(req.body);
    const tokens = await verifyEmailOtpChallenge(mfaToken, code, eventContextFromRequest(req));
    setRefreshCookie(res, tokens.refreshToken, refreshMaxAge);
    res.status(200).json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  })
);

authRouter.post(
  '/2fa/resend-email',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    // Tighter limit than verify; resends drive outbound email volume.
    enforceRateLimit(`auth:2fa-email-resend:ip:${ip}`, 5, 300_000);
    const { mfaToken } = resendEmailOtpSchema.parse(req.body);
    const result = await resendEmailOtpChallenge(mfaToken);
    res
      .status(200)
      .json({ ok: true, expiresIn: result.mfaTokenExpiresIn, emailHint: result.emailHint });
  })
);

authRouter.get(
  '/2fa/email-otp',
  requireAuth,
  asyncHandler(async (req, res) => {
    const enabled = await getEmailOtpEnabled(req.auth!.userId);
    res.status(200).json({ enabled });
  })
);

authRouter.post(
  '/2fa/email-otp',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { enabled, currentPassword } = toggleEmailOtpSchema.parse(req.body);
    await setEmailOtpEnabled(
      req.auth!.userId,
      enabled,
      currentPassword,
      eventContextFromRequest(req)
    );
    res.status(200).json({ enabled });
  })
);

authRouter.post(
  '/2fa/verify-recovery',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    enforceRateLimit(`auth:2fa:ip:${ip}`, 10, 60_000);
    const { mfaToken, code } = totpChallengeSchema.parse(req.body);
    const tokens = await verifyRecoveryChallenge(mfaToken, code, eventContextFromRequest(req));
    setRefreshCookie(res, tokens.refreshToken, refreshMaxAge);
    res.status(200).json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  })
);

// Authenticated — manage your own 2FA.
authRouter.post(
  '/2fa/enrol',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (!auth.email) {
      throw new ApiError('Email not available on session', 400, 'AUTH_NO_EMAIL');
    }
    const { currentPassword } = req.body ?? {};
    const { secret, otpauthUri } = await startTotpEnrolment(
      auth.userId,
      auth.email,
      currentPassword
    );
    res.status(200).json({ secret, otpauthUri });
  })
);

authRouter.post(
  '/2fa/enrol/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { code } = enrolConfirmSchema.parse(req.body);
    const { recoveryCodes } = await confirmTotpEnrolment(
      auth.userId,
      code,
      eventContextFromRequest(req)
    );
    res.status(200).json({ enabled: true, recoveryCodes });
  })
);

authRouter.post(
  '/2fa/disable',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { currentPassword } = disableTotpSchema.parse(req.body);
    await disableTotp(auth.userId, currentPassword, eventContextFromRequest(req));
    res.status(200).json({ enabled: false });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    // 120/min/IP — a single user with several tabs can legitimately
    // generate >20/min on cold loads; the previous 20 cap caused user-visible
    // session loss under normal multi-tab usage.
    enforceRateLimit(`auth:refresh:${clientIp(req)}`, 120, 60_000);
    // Accept refresh token from httpOnly cookie OR body (for backward compat / mobile)
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE] || (req.body as { refreshToken?: string })?.refreshToken;

    if (!refreshToken) {
      throw new ApiError('Refresh token required', 401, 'AUTH_INVALID_REFRESH_TOKEN');
    }

    const tokens = await refreshTokens(refreshToken, eventContextFromRequest(req));

    setRefreshCookie(res, tokens.refreshToken, refreshMaxAge);

    res.status(200).json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  })
);

authRouter.post(
  '/sign-out',
  requireAuth,
  asyncHandler(async (req, res) => {
    await signOut(req.auth!.userId, eventContextFromRequest(req));
    clearRefreshCookie(res);
    res.status(200).json({ ok: true });
  })
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await changePassword(
      req.auth!.userId,
      currentPassword,
      newPassword,
      eventContextFromRequest(req)
    );
    // Password changed -- clear refresh cookie to force re-login
    clearRefreshCookie(res);
    res.status(200).json({ ok: true });
  })
);

// Force set new password (for first login / admin-required password change)
// User is authenticated but doesn't need to provide current password
authRouter.post(
  '/force-change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z.object({ newPassword: passwordSchema }).parse(req.body);
    const auth = req.auth!;

    const hashedPassword = await import('bcryptjs').then((b) =>
      b.default.hash(body.newPassword, 12)
    );

    await db.query(
      `UPDATE public.auth_users SET encrypted_password = $1, refresh_token = NULL, refresh_token_expires_at = NULL, updated_at = now() WHERE id = $2`,
      [hashedPassword, auth.userId]
    );

    // Revoke outstanding access tokens (emits 'access_revoked'), then record
    // the password change itself.
    const eventCtx = eventContextFromRequest(req);
    await bumpTokenVersion(auth.userId, 'force_change_password', eventCtx);
    await logSecurityEvent({
      eventType: 'password_changed',
      severity: 'warning',
      actorUserId: auth.userId,
      ip: eventCtx.ip,
      userAgent: eventCtx.userAgent,
      details: { forced: true },
    });

    clearRefreshCookie(res);
    res.status(200).json({ ok: true });
  })
);

// Mark password as changed in profile (clears must_change_password flag)
authRouter.post(
  '/mark-password-changed',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    await db.query(
      `UPDATE public.profiles SET must_change_password = false, password_reset_required = false, updated_at = now() WHERE user_id = $1`,
      [auth.userId]
    );

    res.status(200).json({ ok: true });
  })
);

authRouter.post(
  '/set-password',
  asyncHandler(async (req, res) => {
    enforceRateLimit(`auth:set-password:${clientIp(req)}`, 5, 60_000);
    const { token, password } = setPasswordSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const invitationResult = await db.query(
      `
      select id, email, first_name, last_name, role, department, organization_id
      from public.invitations
      where token = $1
        and status = 'pending'
        and expires_at > now()
      limit 1
      `,
      [tokenHash]
    );

    const invitation = invitationResult.rows[0] as
      | {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          role: string | null;
          department: string | null;
          organization_id: string;
        }
      | undefined;

    if (!invitation) {
      throw new ApiError('Invalid or expired invitation token', 400, 'AUTH_INVALID_INVITATION');
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.default.hash(password, 12);

    const existingAuthUser = await db.query(
      `select id from public.auth_users where lower(email) = lower($1) limit 1`,
      [invitation.email]
    );

    let userId: string;
    if (existingAuthUser.rows[0]?.id) {
      userId = existingAuthUser.rows[0].id as string;
      await db.query(
        `
        update public.auth_users
        set encrypted_password = $1,
            is_active = true,
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            refresh_token = null,
            refresh_token_expires_at = null,
            updated_at = now()
        where id = $2
        `,
        [hashedPassword, userId]
      );
    } else {
      const inserted = await db.query(
        `
        insert into public.auth_users (
          email,
          encrypted_password,
          is_active,
          email_confirmed_at,
          created_at,
          updated_at
        )
        values (lower($1), $2, true, now(), now(), now())
        returning id
        `,
        [invitation.email, hashedPassword]
      );
      userId = inserted.rows[0].id as string;
    }

    await db.query(
      `
      insert into public.profiles (user_id, email, first_name, last_name, role, department, organization_id, must_change_password, password_reset_required, created_at, updated_at)
      values ($1, lower($2), $3, $4, $5, $6, $7, false, false, now(), now())
      on conflict (user_id)
      do update set
        email = excluded.email,
        first_name = coalesce(excluded.first_name, public.profiles.first_name),
        last_name = coalesce(excluded.last_name, public.profiles.last_name),
        role = coalesce(excluded.role, public.profiles.role),
        department = coalesce(excluded.department, public.profiles.department),
        organization_id = excluded.organization_id,
        must_change_password = false,
        password_reset_required = false,
        updated_at = now()
      `,
      [
        userId,
        invitation.email,
        invitation.first_name,
        invitation.last_name,
        invitation.role || 'user',
        invitation.department,
        invitation.organization_id,
      ]
    );

    if (invitation.role) {
      await db.query(
        `
        insert into public.user_role_assignments (user_id, role_name, organization_id, assigned_by, created_at)
        values ($1, $2, $3, $1, now())
        on conflict do nothing
        `,
        [userId, invitation.role, invitation.organization_id]
      );
    }

    await db.query(
      `
      update public.invitations
      set status = 'accepted',
          updated_at = now()
      where id = $1
      `,
      [invitation.id]
    );

    const result = await signIn(invitation.email, password, eventContextFromRequest(req));
    if (result.kind === 'mfa_required') {
      // Brand-new invitation flow: if 2FA fires, surface the challenge
      // instead of silently failing.
      res.status(200).json({
        mfaRequired: true,
        mfaToken: result.mfaToken,
        expiresIn: result.mfaTokenExpiresIn,
        method: result.method,
        emailHint: result.emailHint,
      });
      return;
    }
    setRefreshCookie(res, result.refreshToken, refreshMaxAge);
    res.status(200).json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  })
);

authRouter.post(
  '/reset-password/request',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    enforceRateLimit(`auth:reset:${ip}`, 3, 60_000); // 3 reset requests per minute per IP

    const { email } = resetRequestSchema.parse(req.body);
    const token = await resetPasswordRequest(email, eventContextFromRequest(req));

    // Send email if token was generated (user exists)
    if (token !== 'ok') {
      try {
        await sendPasswordResetEmail(email, token);
      } catch (err) {
        console.error('Failed to send reset email:', err instanceof Error ? err.message : err);
      }
    }

    res
      .status(200)
      .json({ ok: true, message: 'If an account exists, a reset link has been sent.' });
  })
);

authRouter.post(
  '/reset-password/confirm',
  asyncHandler(async (req, res) => {
    const { token, password } = resetConfirmSchema.parse(req.body);
    await resetPasswordConfirm(token, password, eventContextFromRequest(req));
    clearRefreshCookie(res);
    res.status(200).json({ ok: true });
  })
);

authRouter.get(
  '/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const profile = await db.query(
      `SELECT p.*, o.name as organization_name
       FROM public.profiles p
       LEFT JOIN public.organizations o ON o.id = p.organization_id
       WHERE p.user_id = $1 LIMIT 1`,
      [auth.userId]
    );

    res.status(200).json({
      user: {
        id: auth.userId,
        email: auth.email,
        organizationId: auth.organizationId,
      },
      profile: profile.rows[0] || null,
    });
  })
);
