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

authRouter.post(
  '/reset-password/request',
  asyncHandler(async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    enforceRateLimit(`auth:reset:${ip}`, 3, 60_000); // 3 reset requests per minute per IP

    const { email } = resetRequestSchema.parse(req.body);
    await resetPasswordRequest(email);
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
