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
  signOut,
  refreshTokens,
  changePassword,
  resetPasswordRequest,
  resetPasswordConfirm,
} from '../../services/jwt.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../../services/email.js';
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

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

const resetRequestSchema = z.object({
  email: z.string().email(),
});

const resetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
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

export const authRouter = Router();

authRouter.post(
  '/sign-in',
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    enforceRateLimit(`auth:sign-in:${ip}`, 10, 60_000); // 10 attempts per minute per IP

    const { email, password } = signInSchema.parse(req.body);
    const tokens = await signIn(email, password);

    setRefreshCookie(res, tokens.refreshToken, refreshMaxAge);

    // Don't send refresh token in body -- it's in the httpOnly cookie
    res.status(200).json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  })
);

authRouter.post(
  '/sign-up',
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    enforceRateLimit(`auth:sign-up:${ip}`, 5, 60_000); // 5 sign-ups per minute per IP

    const { email, password, firstName, lastName } = signUpSchema.parse(req.body);
    const tokens = await signUp(email, password, { firstName, lastName });

    setRefreshCookie(res, tokens.refreshToken, refreshMaxAge);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, firstName).catch((err) =>
      console.error('Welcome email failed:', err instanceof Error ? err.message : err)
    );

    res.status(201).json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    // Accept refresh token from httpOnly cookie OR body (for backward compat / mobile)
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE] || (req.body as { refreshToken?: string })?.refreshToken;

    if (!refreshToken) {
      throw new ApiError('Refresh token required', 401, 'AUTH_INVALID_REFRESH_TOKEN');
    }

    const tokens = await refreshTokens(refreshToken);

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
    await signOut(req.auth!.userId);
    clearRefreshCookie(res);
    res.status(200).json({ ok: true });
  })
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await changePassword(req.auth!.userId, currentPassword, newPassword);
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
    const body = z.object({ newPassword: z.string().min(6) }).parse(req.body);
    const auth = req.auth!;

    const hashedPassword = await import('bcryptjs').then((b) =>
      b.default.hash(body.newPassword, 12)
    );

    await db.query(
      `UPDATE public.auth_users SET encrypted_password = $1, refresh_token = NULL, refresh_token_expires_at = NULL, updated_at = now() WHERE id = $2`,
      [hashedPassword, auth.userId]
    );

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
    const { token, password } = setPasswordSchema.parse(req.body);

    const invitationResult = await db.query(
      `
      select id, email, first_name, last_name, role, department, organization_id
      from public.invitations
      where token = $1
        and status = 'pending'
        and expires_at > now()
      limit 1
      `,
      [token]
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

    const tokens = await signIn(invitation.email, password);
    setRefreshCookie(res, tokens.refreshToken, refreshMaxAge);

    res.status(200).json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
    });
  })
);

authRouter.post(
  '/reset-password/request',
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    enforceRateLimit(`auth:reset:${ip}`, 3, 60_000); // 3 reset requests per minute per IP

    const { email } = resetRequestSchema.parse(req.body);
    const token = await resetPasswordRequest(email);

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
    await resetPasswordConfirm(token, password);
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
