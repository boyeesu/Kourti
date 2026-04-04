import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const BCRYPT_COST = 12;

import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string; // user id
  email: string;
  org: string; // organization_id
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  user: {
    id: string;
    email: string;
    organizationId: string;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  organizationId: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET!, {
    algorithm: 'HS256',
    expiresIn: parseExpiresIn(env.JWT_EXPIRES_IN),
  });
}

function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, env.JWT_REFRESH_SECRET!, {
    algorithm: 'HS256',
    expiresIn: parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN),
  });
}

function parseExpiresIn(val: string): number {
  const match = val.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 900;
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
      return 900;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<AuthTokens> {
  const result = await db.query(
    `SELECT au.id, au.email, au.encrypted_password, au.is_active,
            p.organization_id, p.first_name, p.last_name
     FROM public.auth_users au
     LEFT JOIN public.profiles p ON p.user_id = au.id
     WHERE lower(au.email) = lower($1)
     LIMIT 1`,
    [email]
  );

  const user = result.rows[0] as
    | {
        id: string;
        email: string;
        encrypted_password: string;
        is_active: boolean;
        organization_id: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | undefined;

  if (!user) {
    throw new ApiError('Invalid email or password', 401, 'AUTH_INVALID_CREDENTIALS');
  }

  if (!user.is_active) {
    throw new ApiError('Account is disabled', 403, 'AUTH_ACCOUNT_DISABLED');
  }

  const passwordValid = await bcrypt.compare(password, user.encrypted_password);
  if (!passwordValid) {
    throw new ApiError('Invalid email or password', 401, 'AUTH_INVALID_CREDENTIALS');
  }

  const organizationId = user.organization_id || '';

  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    org: organizationId,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  // Store refresh token hash in DB
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const refreshExpires = new Date(Date.now() + parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN) * 1000);

  await db.query(
    `UPDATE public.auth_users SET
       refresh_token = $1,
       refresh_token_expires_at = $2,
       last_sign_in_at = now(),
       updated_at = now()
     WHERE id = $3`,
    [refreshHash, refreshExpires.toISOString(), user.id]
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: parseExpiresIn(env.JWT_EXPIRES_IN),
    user: {
      id: user.id,
      email: user.email,
      organizationId,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  };
}

export async function signUp(
  email: string,
  password: string,
  metadata?: { firstName?: string; lastName?: string }
): Promise<AuthTokens> {
  // Check if user exists
  const existing = await db.query(
    'SELECT id FROM public.auth_users WHERE lower(email) = lower($1)',
    [email]
  );
  if (existing.rows[0]) {
    throw new ApiError('An account with this email already exists', 409, 'AUTH_EMAIL_EXISTS');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

  // Create auth user
  const userResult = await db.query(
    `INSERT INTO public.auth_users (email, encrypted_password, email_confirmed_at, created_at, updated_at)
     VALUES (lower($1), $2, now(), now(), now())
     RETURNING id, email`,
    [email, hashedPassword]
  );
  const newUser = userResult.rows[0] as { id: string; email: string };

  // Create profile (without org -- they'll create/join one during onboarding)
  await db.query(
    `INSERT INTO public.profiles (user_id, email, first_name, last_name, organization_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, '00000000-0000-0000-0000-000000000000', now(), now())
     ON CONFLICT (user_id) DO NOTHING`,
    [newUser.id, newUser.email, metadata?.firstName || null, metadata?.lastName || null]
  );

  // Sign in immediately
  return signIn(email, password);
}

export function verifyAccessToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload;
    return {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.org,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError('Token expired', 401, 'AUTH_TOKEN_EXPIRED');
    }
    throw new ApiError('Invalid token', 401, 'AUTH_INVALID_TOKEN');
  }
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  // Verify the refresh token signature
  let userId: string;
  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET!, {
      algorithms: ['HS256'],
    }) as { sub: string };
    userId = payload.sub;
  } catch {
    throw new ApiError('Invalid refresh token', 401, 'AUTH_INVALID_REFRESH_TOKEN');
  }

  // Verify it matches DB
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const result = await db.query(
    `SELECT au.id, au.email, au.is_active, au.refresh_token, au.refresh_token_expires_at,
            p.organization_id, p.first_name, p.last_name
     FROM public.auth_users au
     LEFT JOIN public.profiles p ON p.user_id = au.id
     WHERE au.id = $1`,
    [userId]
  );

  const user = result.rows[0] as
    | {
        id: string;
        email: string;
        is_active: boolean;
        refresh_token: string | null;
        refresh_token_expires_at: string | null;
        organization_id: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | undefined;

  if (!user || !user.is_active) {
    throw new ApiError('Invalid refresh token', 401, 'AUTH_INVALID_REFRESH_TOKEN');
  }

  if (
    !user.refresh_token ||
    !crypto.timingSafeEqual(Buffer.from(user.refresh_token), Buffer.from(refreshHash))
  ) {
    throw new ApiError('Refresh token revoked', 401, 'AUTH_REFRESH_TOKEN_REVOKED');
  }

  if (user.refresh_token_expires_at && new Date(user.refresh_token_expires_at) < new Date()) {
    throw new ApiError('Refresh token expired', 401, 'AUTH_REFRESH_TOKEN_EXPIRED');
  }

  // Issue new tokens (rotate refresh token)
  const organizationId = user.organization_id || '';
  const payload: JwtPayload = { sub: user.id, email: user.email, org: organizationId };
  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(user.id);
  const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  const refreshExpires = new Date(Date.now() + parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN) * 1000);

  await db.query(
    `UPDATE public.auth_users SET refresh_token = $1, refresh_token_expires_at = $2, updated_at = now() WHERE id = $3`,
    [newRefreshHash, refreshExpires.toISOString(), user.id]
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: parseExpiresIn(env.JWT_EXPIRES_IN),
    user: {
      id: user.id,
      email: user.email,
      organizationId,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  };
}

export async function signOut(userId: string): Promise<void> {
  await db.query(
    'UPDATE public.auth_users SET refresh_token = NULL, refresh_token_expires_at = NULL, updated_at = now() WHERE id = $1',
    [userId]
  );
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const result = await db.query('SELECT encrypted_password FROM public.auth_users WHERE id = $1', [
    userId,
  ]);
  const user = result.rows[0] as { encrypted_password: string } | undefined;
  if (!user) throw new ApiError('User not found', 404, 'NOT_FOUND');

  const valid = await bcrypt.compare(currentPassword, user.encrypted_password);
  if (!valid) throw new ApiError('Current password is incorrect', 401, 'AUTH_INVALID_CREDENTIALS');

  const hashedNew = await bcrypt.hash(newPassword, BCRYPT_COST);
  // Invalidate refresh token so all existing sessions are revoked
  await db.query(
    'UPDATE public.auth_users SET encrypted_password = $1, refresh_token = NULL, refresh_token_expires_at = NULL, updated_at = now() WHERE id = $2',
    [hashedNew, userId]
  );
}

export async function resetPasswordRequest(email: string): Promise<string> {
  const result = await db.query('SELECT id FROM public.auth_users WHERE lower(email) = lower($1)', [
    email,
  ]);
  if (!result.rows[0]) {
    // Don't reveal whether email exists
    return 'ok';
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000); // 1 hour

  await db.query(
    'UPDATE public.auth_users SET password_reset_token = $1, password_reset_expires_at = $2, updated_at = now() WHERE id = $3',
    [
      crypto.createHash('sha256').update(token).digest('hex'),
      expires.toISOString(),
      result.rows[0].id,
    ]
  );

  // Return the raw token -- caller is responsible for emailing it
  return token;
}

export async function resetPasswordConfirm(token: string, newPassword: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await db.query(
    `SELECT id FROM public.auth_users WHERE password_reset_token = $1 AND password_reset_expires_at > now()`,
    [tokenHash]
  );

  if (!result.rows[0]) {
    throw new ApiError('Invalid or expired reset token', 400, 'AUTH_INVALID_RESET_TOKEN');
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);
  await db.query(
    `UPDATE public.auth_users SET
       encrypted_password = $1,
       password_reset_token = NULL,
       password_reset_expires_at = NULL,
       refresh_token = NULL,
       refresh_token_expires_at = NULL,
       updated_at = now()
     WHERE id = $2`,
    [hashedPassword, result.rows[0].id]
  );
}
