import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';
import { sendClientOtpEmail } from './email.js';

const BCRYPT_COST = 12;

// ── OTP constants (mirror services/emailOtp.ts) ─────────────────────────────
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 600; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
// Short-lived JWT that the client redeems via /verify-otp to finish signing in.
const OTP_TOKEN_TTL_SECONDS = 600; // 10 minutes

// Pre-computed bcrypt hash of a fixed dummy string. Used when an email
// doesn't exist (or has no password yet) so signIn always runs a real
// bcrypt.compare and the response time matches the success path — closing
// the user-enumeration timing oracle (CWE-203). Same value as services/jwt.ts.
const DUMMY_PASSWORD_HASH = '$2b$12$N9qo8uLOickgx2ZMRZoMye.IjPeZgSdBmkqPxxnkNLpfZ2y0yV2eC';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ClientAuthUser {
  clientUserId: string;
  email: string;
}

export interface ClientTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  user: { id: string; email: string; fullName: string | null };
}

/**
 * Result of `clientSignIn`. Either we issued session tokens straight away
 * (OTP disabled), or we issued a short-lived `client_otp` token that the
 * client redeems via `clientVerifyOtp` to actually log in.
 */
export type ClientSignInResult =
  | (ClientTokens & { kind: 'tokens' })
  | {
      kind: 'otp_required';
      otpToken: string;
      otpTokenExpiresIn: number;
      // Masked hint so the UI can say "code sent to j***@example.com"
      // without leaking the full address.
      emailHint: string;
    };

interface ClientOtpTokenPayload {
  sub: string;
  email: string;
  typ: 'client_otp';
  iat?: number;
  exp?: number;
}

interface ClientAccessPayload {
  sub: string;
  email: string;
  typ: 'client';
  iat?: number;
  exp?: number;
}

interface ClientRefreshPayload {
  sub: string;
  typ: 'client_refresh';
  iat?: number;
  exp?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a duration string like "15m" / "7d" into seconds. Mirrors the
 *  parser in services/jwt.ts (not exported there, so inlined here). */
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

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Mask an email for display in OTP hints. Mirrors services/jwt.ts. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

function generateNumericCode(length = OTP_LENGTH): string {
  // Reject-sample to avoid modulo bias on 10 digits per draw.
  let out = '';
  while (out.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < 250) out += (byte % 10).toString();
  }
  return out;
}

// HMAC-SHA256 with the server's JWT_SECRET as the key. Prevents a read-only
// DB leak from being brute-forced: without the key, the 10^6 codespace is
// computationally inaccessible.
function hashOtpCode(code: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET!).update(code).digest('hex');
}

// ── Client login OTP (purpose 'login', backed by client_email_otp_codes) ────

/**
 * Generate and email a login OTP to a client. Invalidates any prior un-used
 * codes for the user so only the most recent one is valid. Enforces a 30s
 * resend cooldown. Mirrors services/emailOtp.ts.
 */
export async function issueClientOtp(clientUserId: string, email: string): Promise<void> {
  // Cooldown check
  const recent = await db.query<{ created_at: string }>(
    `select created_at from public.client_email_otp_codes
       where client_user_id = $1 and purpose = 'login' and used_at is null
       order by created_at desc limit 1`,
    [clientUserId]
  );
  if (recent.rows[0]) {
    const ageMs = Date.now() - new Date(recent.rows[0].created_at).getTime();
    if (ageMs < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - ageMs) / 1000);
      throw new ApiError(
        `Please wait ${wait}s before requesting another code`,
        429,
        'CLIENT_OTP_COOLDOWN'
      );
    }
  }

  // Burn any prior unused codes
  await db.query(
    `update public.client_email_otp_codes set used_at = now()
       where client_user_id = $1 and purpose = 'login' and used_at is null`,
    [clientUserId]
  );

  const code = generateNumericCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await db.query(
    `insert into public.client_email_otp_codes (client_user_id, purpose, code_hash, expires_at)
     values ($1, 'login', $2, $3)`,
    [clientUserId, codeHash, expiresAt.toISOString()]
  );

  await sendClientOtpEmail(email, code);
}

/**
 * Verify a client login OTP. Single-use: marks the code consumed on success.
 * Tracks attempts to block brute force. Throws ApiError on failure.
 */
export async function verifyClientOtp(clientUserId: string, code: string): Promise<void> {
  const cleaned = code.trim();
  if (!/^\d{4,8}$/.test(cleaned)) {
    throw new ApiError('Invalid verification code', 400, 'CLIENT_OTP_INVALID_FORMAT');
  }

  const r = await db.query<{
    id: string;
    code_hash: string;
    expires_at: string;
    attempts: number;
    used_at: string | null;
  }>(
    `select id, code_hash, expires_at, attempts, used_at
       from public.client_email_otp_codes
       where client_user_id = $1 and purpose = 'login'
       order by created_at desc limit 1`,
    [clientUserId]
  );
  const row = r.rows[0];
  if (!row || row.used_at) {
    throw new ApiError(
      'No active verification code. Request a new one.',
      400,
      'CLIENT_OTP_NOT_FOUND'
    );
  }
  if (new Date(row.expires_at) < new Date()) {
    throw new ApiError(
      'Verification code has expired. Request a new one.',
      400,
      'CLIENT_OTP_EXPIRED'
    );
  }
  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    // Burn it so the user must request a fresh code.
    await db.query(`update public.client_email_otp_codes set used_at = now() where id = $1`, [
      row.id,
    ]);
    throw new ApiError(
      'Too many incorrect attempts. Request a new code.',
      429,
      'CLIENT_OTP_TOO_MANY_ATTEMPTS'
    );
  }

  const submitted = hashOtpCode(cleaned);
  const expected = Buffer.from(row.code_hash, 'hex');
  const got = Buffer.from(submitted, 'hex');
  const ok = expected.length === got.length && crypto.timingSafeEqual(expected, got);

  if (!ok) {
    await db.query(
      `update public.client_email_otp_codes set attempts = attempts + 1 where id = $1`,
      [row.id]
    );
    throw new ApiError('Invalid verification code', 401, 'CLIENT_OTP_INVALID');
  }

  await db.query(`update public.client_email_otp_codes set used_at = now() where id = $1`, [
    row.id,
  ]);
}

// Sign / verify the short-lived `client_otp` JWT used between /login and
// /verify-otp. typ !== 'client', so it can NEVER authenticate the portal.
function signClientOtpToken(clientUserId: string, email: string): string {
  return jwt.sign(
    { sub: clientUserId, email, typ: 'client_otp' } as ClientOtpTokenPayload,
    env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: OTP_TOKEN_TTL_SECONDS }
  );
}

function verifyClientOtpToken(otpToken: string): ClientOtpTokenPayload {
  let payload: ClientOtpTokenPayload & { typ?: string };
  try {
    payload = jwt.verify(otpToken, env.JWT_SECRET!, {
      algorithms: ['HS256'],
    }) as ClientOtpTokenPayload;
  } catch {
    throw new ApiError('Invalid or expired sign-in challenge', 401, 'CLIENT_OTP_CHALLENGE_INVALID');
  }
  if (payload.typ !== 'client_otp') {
    throw new ApiError('Invalid or expired sign-in challenge', 401, 'CLIENT_OTP_CHALLENGE_INVALID');
  }
  return payload;
}

// ── Token signing / verification ──────────────────────────────────────────

export function signClientTokens(u: {
  id: string;
  email: string;
  fullName: string | null;
}): ClientTokens {
  const accessToken = jwt.sign(
    { sub: u.id, email: u.email, typ: 'client' } as ClientAccessPayload,
    env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: parseExpiresIn(env.JWT_EXPIRES_IN) }
  );
  const refreshToken = jwt.sign(
    { sub: u.id, typ: 'client_refresh' } as ClientRefreshPayload,
    env.JWT_REFRESH_SECRET!,
    { algorithm: 'HS256', expiresIn: parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN) }
  );
  return {
    accessToken,
    refreshToken,
    expiresIn: parseExpiresIn(env.JWT_EXPIRES_IN),
    user: { id: u.id, email: u.email, fullName: u.fullName },
  };
}

/** Verify a client ACCESS token. Throws ApiError if missing/expired or if
 *  typ !== 'client' (so a staff token can never authenticate the portal). */
export function verifyClientAccessToken(token: string): ClientAuthUser {
  let payload: ClientAccessPayload & { typ?: string };
  try {
    payload = jwt.verify(token, env.JWT_SECRET!, { algorithms: ['HS256'] }) as ClientAccessPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError('Token expired', 401, 'CLIENT_AUTH_TOKEN_EXPIRED');
    }
    throw new ApiError('Invalid token', 401, 'CLIENT_AUTH_INVALID_TOKEN');
  }
  if (payload.typ !== 'client') {
    throw new ApiError('Invalid token', 401, 'CLIENT_AUTH_INVALID_TOKEN');
  }
  return { clientUserId: payload.sub, email: payload.email };
}

/** Verify a client REFRESH token. Throws ApiError unless typ === 'client_refresh'. */
export function verifyClientRefreshToken(token: string): { sub: string } {
  let payload: ClientRefreshPayload & { typ?: string };
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET!, {
      algorithms: ['HS256'],
    }) as ClientRefreshPayload;
  } catch {
    throw new ApiError('Invalid refresh token', 401, 'CLIENT_AUTH_INVALID_REFRESH_TOKEN');
  }
  if (payload.typ !== 'client_refresh') {
    throw new ApiError('Invalid refresh token', 401, 'CLIENT_AUTH_INVALID_REFRESH_TOKEN');
  }
  return { sub: payload.sub };
}

// ── Persistence helpers ─────────────────────────────────────────────────────

interface ClientUserRow {
  id: string;
  email: string;
  encrypted_password: string | null;
  full_name: string | null;
  is_active: boolean;
  refresh_token: string | null;
  refresh_token_expires_at: string | null;
}

async function issueClientTokensAndStore(u: {
  id: string;
  email: string;
  fullName: string | null;
}): Promise<ClientTokens> {
  const tokens = signClientTokens(u);
  const refreshHash = sha256(tokens.refreshToken);
  const refreshExpires = new Date(Date.now() + parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN) * 1000);
  await db.query(
    `UPDATE public.client_users SET
       refresh_token = $1,
       refresh_token_expires_at = $2,
       last_sign_in_at = now(),
       updated_at = now()
     WHERE id = $3`,
    [refreshHash, refreshExpires.toISOString(), u.id]
  );
  return tokens;
}

// ── Auth flows ──────────────────────────────────────────────────────────────

export async function clientSignIn(email: string, password: string): Promise<ClientSignInResult> {
  const result = await db.query<ClientUserRow & { otp_enabled: boolean | null }>(
    `SELECT id, email, encrypted_password, full_name, is_active, otp_enabled
     FROM public.client_users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email]
  );
  const user = result.rows[0];

  // Always run a real bcrypt.compare so timing doesn't reveal account state.
  // A null password means the invite hasn't been accepted yet — treat as
  // invalid credentials but still burn the time.
  const hashToCheck = user?.encrypted_password ?? DUMMY_PASSWORD_HASH;
  const passwordValid = await bcrypt.compare(password, hashToCheck);

  if (!user || !user.encrypted_password || !passwordValid) {
    throw new ApiError('Invalid email or password', 401, 'CLIENT_AUTH_INVALID_CREDENTIALS');
  }
  if (!user.is_active) {
    throw new ApiError('Account is disabled', 403, 'CLIENT_AUTH_ACCOUNT_DISABLED');
  }

  // client_users is a GLOBAL identity (multi-firm). Even if this client's own
  // otp_enabled flag is off, OTP must be forced when ANY firm they currently
  // have ACTIVE access to (client-level or per-matter) requires it.
  const firmReq = await db.query<{ required: boolean }>(
    `select exists(
       select 1 from public.organizations o
        where o.portal_require_otp = true
          and (
            exists(select 1 from public.client_portal_access cpa
                    where cpa.client_user_id = $1 and cpa.status = 'active' and cpa.organization_id = o.id)
            or exists(select 1 from public.client_case_access cca
                    where cca.client_user_id = $1 and cca.status = 'active' and cca.organization_id = o.id)
          )
     ) as required`,
    [user.id]
  );
  const firmRequiresOtp = firmReq.rows[0]?.required === true;

  // Email OTP is on-by-default (otp_enabled defaults true). When enabled — or
  // when a firm policy forces it — we issue a short-lived `client_otp` token
  // and email a code instead of session tokens; the client redeems both via
  // clientVerifyOtp.
  if (user.otp_enabled !== false || firmRequiresOtp) {
    await issueClientOtp(user.id, user.email);
    return {
      kind: 'otp_required',
      otpToken: signClientOtpToken(user.id, user.email),
      otpTokenExpiresIn: OTP_TOKEN_TTL_SECONDS,
      emailHint: maskEmail(user.email),
    };
  }

  const tokens = await issueClientTokensAndStore({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
  });
  return { kind: 'tokens', ...tokens };
}

/**
 * Redeem a `client_otp` challenge: verify the OTP token, check the emailed
 * code, then issue and store session tokens. Throws ApiError on failure.
 */
export async function clientVerifyOtp(otpToken: string, code: string): Promise<ClientTokens> {
  const payload = verifyClientOtpToken(otpToken);
  await verifyClientOtp(payload.sub, code);

  const result = await db.query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
  }>(
    `SELECT id, email, full_name, is_active
     FROM public.client_users
     WHERE id = $1
     LIMIT 1`,
    [payload.sub]
  );
  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw new ApiError('Account is disabled', 403, 'CLIENT_AUTH_ACCOUNT_DISABLED');
  }

  return issueClientTokensAndStore({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
  });
}

/**
 * Resend a login OTP for an in-flight challenge. Re-uses the same masked
 * hint. Enforces the 30s cooldown via issueClientOtp.
 */
export async function clientResendOtp(
  otpToken: string
): Promise<{ otpTokenExpiresIn: number; emailHint: string }> {
  const payload = verifyClientOtpToken(otpToken);
  await issueClientOtp(payload.sub, payload.email);
  return {
    otpTokenExpiresIn: OTP_TOKEN_TTL_SECONDS,
    emailHint: maskEmail(payload.email),
  };
}

export async function clientRefresh(refreshToken: string): Promise<ClientTokens> {
  const { sub } = verifyClientRefreshToken(refreshToken);

  const refreshHash = sha256(refreshToken);
  const result = await db.query<ClientUserRow>(
    `SELECT id, email, full_name, is_active, refresh_token, refresh_token_expires_at
     FROM public.client_users
     WHERE id = $1
     LIMIT 1`,
    [sub]
  );
  const user = result.rows[0];

  if (!user || !user.is_active) {
    throw new ApiError('Invalid refresh token', 401, 'CLIENT_AUTH_INVALID_REFRESH_TOKEN');
  }
  if (
    !user.refresh_token ||
    user.refresh_token.length !== refreshHash.length ||
    !crypto.timingSafeEqual(Buffer.from(user.refresh_token), Buffer.from(refreshHash))
  ) {
    throw new ApiError('Refresh token revoked', 401, 'CLIENT_AUTH_REFRESH_TOKEN_REVOKED');
  }
  if (user.refresh_token_expires_at && new Date(user.refresh_token_expires_at) < new Date()) {
    throw new ApiError('Refresh token expired', 401, 'CLIENT_AUTH_REFRESH_TOKEN_EXPIRED');
  }

  // Rotate.
  return issueClientTokensAndStore({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
  });
}

export async function clientSignOut(clientUserId: string): Promise<void> {
  await db.query(
    `UPDATE public.client_users SET
       refresh_token = NULL,
       refresh_token_expires_at = NULL,
       updated_at = now()
     WHERE id = $1`,
    [clientUserId]
  );
}

/**
 * Invite acceptance: the client sets their password via the invite token
 * emailed by the firm. The token must be unexpired. Issues session tokens.
 */
export async function acceptClientInvite(
  token: string,
  password: string,
  fullName?: string
): Promise<ClientTokens> {
  const found = await db.query<{ id: string; email: string }>(
    `SELECT id, email FROM public.client_users
     WHERE invite_token = $1 AND invite_expires_at > now()
     LIMIT 1`,
    [token]
  );
  const row = found.rows[0];
  if (!row) {
    throw new ApiError('Invalid or expired invite', 400, 'CLIENT_AUTH_INVALID_INVITE');
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
  const updated = await db.query<{
    id: string;
    email: string;
    full_name: string | null;
  }>(
    `UPDATE public.client_users SET
       encrypted_password = $1,
       email_verified_at = now(),
       full_name = coalesce($2, full_name),
       is_active = true,
       invite_token = NULL,
       invite_expires_at = NULL,
       updated_at = now()
     WHERE id = $3
     RETURNING id, email, full_name`,
    [hashedPassword, fullName ?? null, row.id]
  );
  const user = updated.rows[0];

  return issueClientTokensAndStore({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
  });
}

/**
 * Begin a password reset. Same timing-safe pattern as jwt.ts: always do the
 * work, return the raw token if the user exists, else null.
 */
export async function clientResetPasswordRequest(email: string): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    'SELECT id FROM public.client_users WHERE lower(email) = lower($1) LIMIT 1',
    [email]
  );

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const expires = new Date(Date.now() + 3600000); // 1 hour
  const targetId = result.rows[0]?.id ?? '00000000-0000-0000-0000-000000000000';

  await db.query(
    `UPDATE public.client_users SET
       password_reset_token = $1,
       password_reset_expires_at = $2,
       updated_at = now()
     WHERE id = $3`,
    [tokenHash, expires.toISOString(), targetId]
  );

  if (!result.rows[0]) return null;
  return token;
}

export async function clientResetPasswordConfirm(token: string, password: string): Promise<void> {
  const tokenHash = sha256(token);
  const result = await db.query<{ id: string }>(
    `SELECT id FROM public.client_users
     WHERE password_reset_token = $1 AND password_reset_expires_at > now()
     LIMIT 1`,
    [tokenHash]
  );
  if (!result.rows[0]) {
    throw new ApiError('Invalid or expired reset token', 400, 'CLIENT_AUTH_INVALID_RESET_TOKEN');
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
  await db.query(
    `UPDATE public.client_users SET
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

/**
 * Find-or-create the GLOBAL client_user for an email (used by staff invite).
 * Always mints a fresh 24h invite token so re-invites work even when the
 * client never accepted. Returns the id and the usable invite token.
 */
export async function ensureClientUserForInvite(
  email: string,
  fullName?: string
): Promise<{ clientUserId: string; inviteToken: string; isNew: boolean }> {
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const inviteExpires = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM public.client_users WHERE lower(email) = lower($1) LIMIT 1',
    [email]
  );

  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    await db.query(
      `UPDATE public.client_users SET
         invite_token = $1,
         invite_expires_at = $2,
         full_name = coalesce(full_name, $3),
         updated_at = now()
       WHERE id = $4`,
      [inviteToken, inviteExpires.toISOString(), fullName ?? null, id]
    );
    return { clientUserId: id, inviteToken, isNew: false };
  }

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO public.client_users
       (email, encrypted_password, full_name, invite_token, invite_expires_at, created_at, updated_at)
     VALUES (lower($1), NULL, $2, $3, $4, now(), now())
     RETURNING id`,
    [email, fullName ?? null, inviteToken, inviteExpires.toISOString()]
  );
  return { clientUserId: inserted.rows[0].id, inviteToken, isNew: true };
}
