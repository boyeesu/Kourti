import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

import {
  generateTotpSecret,
  buildTotpUri,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from './totp.js';
import { issueEmailOtp, verifyEmailOtp, type EmailOtpPurpose } from './emailOtp.js';
import { brevoSyncSignup, logBrevoError } from './brevo.js';
import { sendWelcomeEmail } from './email.js';
import { logSecurityEvent } from './securityEvents.js';
import { encryptField, decryptField } from './fieldCrypto.js';

const BCRYPT_COST = 12;

import { env } from '../config/env.js';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';

/**
 * Optional request context threaded from the route layer so security events
 * can record the originating IP / user-agent. Service functions accept this
 * as a trailing optional arg; when absent we still log, just without IP/UA.
 */
export interface AuthEventContext {
  ip?: string | null;
  userAgent?: string | null;
}

// Pre-computed bcrypt hash of a fixed dummy string. Used when an email
// doesn't exist so signIn always runs a real bcrypt.compare and the
// response time matches the success path — closing the user-enumeration
// timing oracle (CWE-203).
const DUMMY_PASSWORD_HASH = '$2b$12$N9qo8uLOickgx2ZMRZoMye.IjPeZgSdBmkqPxxnkNLpfZ2y0yV2eC';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Impersonation claim carried by a "View as" access token. `sid` is the
 * public.impersonation_sessions row id — checked active on every request so a
 * session can be force-revoked. `scope='read'` tokens are blocked from mutating
 * requests at the middleware layer.
 */
export interface ImpersonationClaim {
  sid: string; // impersonation_sessions.id
  by: string; // admin user id who started the session
  scope: 'read' | 'write';
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  org: string; // organization_id
  tv?: number; // token_version epoch — access tokens are revoked when this is bumped
  imp?: ImpersonationClaim;
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
  tokenVersion?: number; // `tv` claim; compared against DB to detect revocation
  impersonation?: ImpersonationClaim;
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

/**
 * Mint a short-lived access token that authenticates AS `target` but carries an
 * impersonation claim. Used by the platform-admin "View as" flow. No refresh
 * token is issued — impersonation sessions are deliberately short and must be
 * re-started. `expiresInSeconds` is clamped by the caller to the session TTL.
 */
export function signImpersonationAccessToken(
  target: { id: string; email: string; organizationId: string },
  impersonation: ImpersonationClaim,
  expiresInSeconds: number
): string {
  const payload: JwtPayload = {
    sub: target.id,
    email: target.email,
    org: target.organizationId,
    imp: impersonation,
  };
  return jwt.sign(payload, env.JWT_SECRET!, {
    algorithm: 'HS256',
    expiresIn: expiresInSeconds,
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

// ── Token-version (access-token revocation epoch) ────────────────────────────

/**
 * Read a user's current token_version. Access tokens carry the version they
 * were minted at (`tv`); a mismatch means the token has been revoked.
 */
export async function getTokenVersion(userId: string): Promise<number> {
  const r = await db.query<{ token_version: number }>(
    'SELECT token_version FROM public.auth_users WHERE id = $1',
    [userId]
  );
  return r.rows[0]?.token_version ?? 0;
}

/**
 * Bump a user's token_version, instantly revoking every access token minted at
 * the old epoch. Called on logout, password change/reset, force-change, and
 * when a second factor is disabled. Emits an 'access_revoked' security event.
 */
export async function bumpTokenVersion(
  userId: string,
  reason: string,
  ctx?: AuthEventContext
): Promise<void> {
  await db.query(
    'UPDATE public.auth_users SET token_version = token_version + 1, updated_at = now() WHERE id = $1',
    [userId]
  );
  await logSecurityEvent({
    eventType: 'access_revoked',
    severity: 'warning',
    actorUserId: userId,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
    details: { reason },
  });
}

const PRIVILEGED_ROLES = ['platform_admin', 'superadmin', 'admin'];

/**
 * True if the user holds any platform-privileged role. Privileged users may not
 * disable their last remaining second factor (MFA is mandatory for them).
 */
export async function isPrivilegedUser(userId: string): Promise<boolean> {
  const r = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM public.user_role_assignments
       WHERE user_id = $1 AND role_name = ANY($2)
     ) AS exists`,
    [userId, PRIVILEGED_ROLES]
  );
  return r.rows[0]?.exists === true;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Result of `signIn`. Either we issued tokens straight away, or we
 * issued a short-lived MFA-pending token that the client redeems via
 * `verifyTotpChallenge`/`verifyRecoveryChallenge` to actually log in.
 */
export type MfaMethod = 'totp' | 'email_otp';

export type SignInResult =
  | (AuthTokens & { kind: 'tokens' })
  | {
      kind: 'mfa_required';
      mfaToken: string;
      mfaTokenExpiresIn: number;
      method: MfaMethod;
      // For email OTP we surface a masked hint so the UI can say
      // "code sent to j***@example.com" without leaking the address.
      emailHint?: string;
    };

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

export async function signIn(
  email: string,
  password: string,
  ctx?: AuthEventContext
): Promise<SignInResult> {
  const result = await db.query(
    `SELECT au.id, au.email, au.encrypted_password, au.is_active,
            au.totp_enabled, au.totp_secret, au.email_otp_enabled, au.token_version,
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
        totp_enabled: boolean | null;
        totp_secret: string | null;
        email_otp_enabled: boolean | null;
        token_version: number | null;
        organization_id: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | undefined;

  // Always run bcrypt.compare against either the real hash or a fixed
  // dummy hash so the response time doesn't reveal whether the email
  // exists. Then fold the user-existence check into the credential check
  // so we surface a single generic error.
  const hashToCheck = user?.encrypted_password ?? DUMMY_PASSWORD_HASH;
  const passwordValid = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordValid) {
    await logSecurityEvent({
      eventType: 'login_failed',
      severity: 'warning',
      actorUserId: user?.id ?? null,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      details: { reason: 'invalid_credentials' },
    });
    throw new ApiError('Invalid email or password', 401, 'AUTH_INVALID_CREDENTIALS');
  }

  if (!user.is_active) {
    await logSecurityEvent({
      eventType: 'login_blocked',
      severity: 'warning',
      actorUserId: user.id,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      details: { reason: 'account_disabled' },
    });
    throw new ApiError('Account is disabled', 403, 'AUTH_ACCOUNT_DISABLED');
  }

  // If 2FA is enabled, return a short-lived MFA-pending token instead of
  // session tokens. TOTP takes precedence over email OTP if the user has
  // both enabled.
  if (user.totp_enabled && user.totp_secret) {
    return issueMfaChallenge(user.id, user.email, 'totp');
  }

  // Email OTP is on-by-default for new accounts; this is the standard
  // path for most users until they enrol an authenticator app.
  if (user.email_otp_enabled !== false) {
    return issueMfaChallenge(user.id, user.email, 'email_otp', 'login');
  }

  return issueTokensForUser(user, ctx);
}

async function issueMfaChallenge(
  userId: string,
  email: string,
  method: MfaMethod,
  emailOtpPurpose: EmailOtpPurpose = 'login'
): Promise<SignInResult> {
  const mfaTokenExpiresIn = 600; // 10 minutes — matches OTP TTL
  const mfaToken = jwt.sign(
    { sub: userId, email, mfa: true, method, purpose: emailOtpPurpose },
    env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: mfaTokenExpiresIn }
  );
  if (method === 'email_otp') {
    // Best-effort: failures here surface to the caller so they can
    // retry rather than getting stuck.
    await issueEmailOtp(userId, email, emailOtpPurpose);
  }
  return {
    kind: 'mfa_required',
    mfaToken,
    mfaTokenExpiresIn,
    method,
    emailHint: method === 'email_otp' ? maskEmail(email) : undefined,
  };
}

interface UserRow {
  id: string;
  email: string;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
}

async function ensureOrganizationForUser(user: UserRow): Promise<string> {
  if (user.organization_id) return user.organization_id;

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.email.split('@')[0] ||
    'Workspace';

  const orgResult = await db.query<{ id: string }>(
    `insert into public.organizations (name, email, status, is_active, created_at, updated_at)
     values ($1, $2, 'active', true, now(), now())
     returning id`,
    [`${displayName}'s Workspace`, user.email]
  );
  const orgId = orgResult.rows[0].id;

  await db.query(
    `update public.profiles set organization_id = $1, updated_at = now() where user_id = $2`,
    [orgId, user.id]
  );

  user.organization_id = orgId;
  return orgId;
}

async function issueTokensForUser(
  user: UserRow,
  ctx?: AuthEventContext
): Promise<AuthTokens & { kind: 'tokens' }> {
  const organizationId = await ensureOrganizationForUser(user);

  // Stamp the access token with the user's current epoch so it can be
  // revoked en masse by bumping token_version.
  const tokenVersion = await getTokenVersion(user.id);

  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    org: organizationId,
    tv: tokenVersion,
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
       login_count = COALESCE(login_count, 0) + 1,
       updated_at = now()
     WHERE id = $3`,
    [refreshHash, refreshExpires.toISOString(), user.id]
  );

  await logSecurityEvent({
    eventType: 'login_success',
    severity: 'info',
    actorUserId: user.id,
    organizationId,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  });

  return {
    kind: 'tokens',
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

// ── 2FA / TOTP ───────────────────────────────────────────────────────

interface MfaTokenPayload {
  sub: string;
  email: string;
  mfa: true;
  method?: MfaMethod;
  purpose?: EmailOtpPurpose;
}

function verifyMfaToken(mfaToken: string): MfaTokenPayload {
  try {
    const payload = jwt.verify(mfaToken, env.JWT_SECRET!, {
      algorithms: ['HS256'],
    }) as MfaTokenPayload;
    if (!payload?.mfa) throw new Error('not an mfa token');
    return payload;
  } catch {
    throw new ApiError('Invalid or expired 2FA challenge', 401, 'AUTH_MFA_INVALID');
  }
}

export async function verifyEmailOtpChallenge(
  mfaToken: string,
  code: string,
  ctx?: AuthEventContext
): Promise<AuthTokens & { kind: 'tokens' }> {
  const payload = verifyMfaToken(mfaToken);
  if (payload.method !== 'email_otp') {
    throw new ApiError('Wrong 2FA method', 400, 'AUTH_MFA_WRONG_METHOD');
  }
  const purpose: EmailOtpPurpose = payload.purpose ?? 'login';
  try {
    await verifyEmailOtp(payload.sub, purpose, code);
  } catch (err) {
    await logSecurityEvent({
      eventType: 'mfa_challenge_failed',
      severity: 'warning',
      actorUserId: payload.sub,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      details: { method: 'email_otp', purpose },
    });
    throw err;
  }

  // On signup, flip activation + email_confirmed_at so the user finally
  // "exists" from the app's perspective.
  if (purpose === 'signup') {
    // RETURNING `email_confirmed_at = updated_at` tells us whether the
    // coalesce just set the column (first verification) or kept the old
    // value (re-verification). Gating welcome/Brevo on this prevents
    // duplicate sends if the user re-runs the verify flow.
    const updated = await db.query<{ first_confirm: boolean }>(
      `update public.auth_users
         set email_confirmed_at = coalesce(email_confirmed_at, now()),
             is_active = true,
             updated_at = now()
       where id = $1
       returning (email_confirmed_at = updated_at) as first_confirm`,
      [payload.sub]
    );
    const firstConfirm = updated.rows[0]?.first_confirm === true;

    if (firstConfirm) {
      const profile = await db.query<{ first_name: string | null; last_name: string | null }>(
        'select first_name, last_name from public.profiles where user_id = $1 limit 1',
        [payload.sub]
      );
      const firstName = profile.rows[0]?.first_name ?? undefined;
      const lastName = profile.rows[0]?.last_name ?? undefined;

      sendWelcomeEmail(payload.email, firstName).catch((err) =>
        console.error('Welcome email failed:', err instanceof Error ? err.message : err)
      );
      brevoSyncSignup(payload.email, {
        firstName,
        lastName,
        userId: payload.sub,
      }).catch(logBrevoError);
    }
  }

  const user = await loadUserForMfa(payload.sub);
  return issueTokensForUser(user, ctx);
}

export async function resendEmailOtpChallenge(
  mfaToken: string
): Promise<{ mfaTokenExpiresIn: number; emailHint: string }> {
  const payload = verifyMfaToken(mfaToken);
  if (payload.method !== 'email_otp') {
    throw new ApiError('Wrong 2FA method', 400, 'AUTH_MFA_WRONG_METHOD');
  }
  const purpose: EmailOtpPurpose = payload.purpose ?? 'login';
  await issueEmailOtp(payload.sub, payload.email, purpose);
  return { mfaTokenExpiresIn: 600, emailHint: maskEmail(payload.email) };
}

async function loadUserForMfa(userId: string): Promise<
  UserRow & {
    totp_enabled: boolean;
    totp_secret: string | null;
    totp_recovery_codes_hash: string[] | null;
    is_active: boolean;
  }
> {
  const r = await db.query(
    `SELECT au.id, au.email, au.is_active, au.totp_enabled, au.totp_secret, au.totp_recovery_codes_hash,
            p.organization_id, p.first_name, p.last_name
     FROM public.auth_users au
     LEFT JOIN public.profiles p ON p.user_id = au.id
     WHERE au.id = $1`,
    [userId]
  );
  const user = r.rows[0];
  if (!user) {
    throw new ApiError('Invalid 2FA challenge', 401, 'AUTH_MFA_INVALID');
  }
  return user;
}

export async function verifyTotpChallenge(
  mfaToken: string,
  code: string,
  ctx?: AuthEventContext
): Promise<AuthTokens & { kind: 'tokens' }> {
  const payload = verifyMfaToken(mfaToken);
  const user = await loadUserForMfa(payload.sub);
  if (!user.totp_enabled || !user.totp_secret) {
    throw new ApiError('2FA not enabled for this user', 400, 'AUTH_MFA_NOT_ENABLED');
  }
  // Secrets are stored encrypted at rest; decryptField passes legacy
  // plaintext through unchanged so pre-migration rows still verify.
  if (!verifyTotp(decryptField(user.totp_secret) ?? '', code)) {
    await logSecurityEvent({
      eventType: 'mfa_challenge_failed',
      severity: 'warning',
      actorUserId: user.id,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      details: { method: 'totp' },
    });
    throw new ApiError('Invalid 2FA code', 401, 'AUTH_MFA_INVALID_CODE');
  }
  return issueTokensForUser(user, ctx);
}

export async function verifyRecoveryChallenge(
  mfaToken: string,
  code: string,
  ctx?: AuthEventContext
): Promise<AuthTokens & { kind: 'tokens' }> {
  const payload = verifyMfaToken(mfaToken);
  const user = await loadUserForMfa(payload.sub);
  const hashes = user.totp_recovery_codes_hash ?? [];
  const { ok, index } = verifyRecoveryCode(code, hashes);
  if (!ok) {
    await logSecurityEvent({
      eventType: 'mfa_challenge_failed',
      severity: 'warning',
      actorUserId: user.id,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      details: { method: 'recovery_code' },
    });
    throw new ApiError('Invalid recovery code', 401, 'AUTH_MFA_INVALID_RECOVERY');
  }
  // Single-use: blank out the matching hash so the same code can't be replayed.
  const next = [...hashes];
  next[index] = '';
  await db.query(
    'UPDATE public.auth_users SET totp_recovery_codes_hash = $1, updated_at = now() WHERE id = $2',
    [next, user.id]
  );
  await logSecurityEvent({
    eventType: 'recovery_code_used',
    severity: 'warning',
    actorUserId: user.id,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  });
  return issueTokensForUser(user, ctx);
}

/**
 * Begin TOTP enrolment. Returns the secret (base32) and otpauth URI for
 * QR display. The secret is stored on the user but `totp_enabled` stays
 * false until they confirm with `confirmTotpEnrolment`.
 */
export async function startTotpEnrolment(
  userId: string,
  email: string,
  currentPassword?: string
): Promise<{ secret: string; otpauthUri: string }> {
  // If TOTP is already enabled, require password to prevent an attacker
  // with a stolen access token from replacing the second factor.
  const existing = await db.query<{ totp_enabled: boolean; encrypted_password: string }>(
    'SELECT totp_enabled, encrypted_password FROM public.auth_users WHERE id = $1',
    [userId]
  );
  const row = existing.rows[0];
  if (!row) throw new ApiError('User not found', 404, 'NOT_FOUND');
  if (row.totp_enabled) {
    if (!currentPassword) {
      throw new ApiError(
        'Current password is required to re-enrol 2FA',
        400,
        'AUTH_PASSWORD_REQUIRED'
      );
    }
    const ok = await bcrypt.compare(currentPassword, row.encrypted_password);
    if (!ok) {
      throw new ApiError('Current password is incorrect', 401, 'AUTH_INVALID_CREDENTIALS');
    }
  }

  const secret = generateTotpSecret();
  // Encrypt the secret at rest; the plaintext is only ever returned here for
  // QR display and never stored unencrypted.
  await db.query(
    'UPDATE public.auth_users SET totp_secret = $1, totp_enabled = false, updated_at = now() WHERE id = $2',
    [encryptField(secret), userId]
  );
  return { secret, otpauthUri: buildTotpUri(secret, email) };
}

/**
 * Confirm TOTP enrolment. The user must successfully verify a code
 * generated from the freshly-issued secret. On success: flip
 * `totp_enabled` to true and return a one-time list of recovery codes.
 */
export async function confirmTotpEnrolment(
  userId: string,
  code: string,
  ctx?: AuthEventContext
): Promise<{ recoveryCodes: string[] }> {
  const r = await db.query<{ totp_secret: string | null; totp_enabled: boolean }>(
    'SELECT totp_secret, totp_enabled FROM public.auth_users WHERE id = $1',
    [userId]
  );
  const row = r.rows[0];
  if (!row?.totp_secret) {
    throw new ApiError('Start TOTP enrolment first', 400, 'AUTH_MFA_NO_SECRET');
  }
  // Stored encrypted at rest; decrypt before verifying (legacy plaintext
  // passes through unchanged).
  if (!verifyTotp(decryptField(row.totp_secret) ?? '', code)) {
    throw new ApiError('Invalid 2FA code', 401, 'AUTH_MFA_INVALID_CODE');
  }
  const recoveryCodes = generateRecoveryCodes(10);
  const recoveryHashes = recoveryCodes.map(hashRecoveryCode);
  await db.query(
    'UPDATE public.auth_users SET totp_enabled = true, totp_recovery_codes_hash = $1, updated_at = now() WHERE id = $2',
    [recoveryHashes, userId]
  );
  await logSecurityEvent({
    eventType: 'mfa_enabled',
    severity: 'info',
    actorUserId: userId,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
    details: { method: 'totp' },
  });
  return { recoveryCodes };
}

/**
 * Disable TOTP. Requires the current password to prevent an attacker
 * with a stolen access token from removing the second factor.
 */
export async function disableTotp(
  userId: string,
  currentPassword: string,
  ctx?: AuthEventContext
): Promise<void> {
  const r = await db.query<{ encrypted_password: string; email_otp_enabled: boolean | null }>(
    'SELECT encrypted_password, email_otp_enabled FROM public.auth_users WHERE id = $1',
    [userId]
  );
  const row = r.rows[0];
  if (!row) throw new ApiError('User not found', 404, 'NOT_FOUND');
  const ok = await bcrypt.compare(currentPassword, row.encrypted_password);
  if (!ok) {
    throw new ApiError('Current password is incorrect', 401, 'AUTH_INVALID_CREDENTIALS');
  }
  // Privileged users must always retain at least one second factor. If email
  // OTP is also off, disabling TOTP would leave them with none — block it.
  const emailOtpActive = row.email_otp_enabled !== false;
  if (!emailOtpActive && (await isPrivilegedUser(userId))) {
    throw new ApiError(
      'Administrators must keep at least one form of two-factor authentication enabled.',
      403,
      'MFA_REQUIRED_FOR_ROLE'
    );
  }
  await db.query(
    `UPDATE public.auth_users SET totp_enabled = false, totp_secret = NULL,
       totp_recovery_codes_hash = NULL, updated_at = now() WHERE id = $1`,
    [userId]
  );
  // Disabling a second factor revokes existing access tokens.
  await bumpTokenVersion(userId, 'totp_disabled', ctx);
  await logSecurityEvent({
    eventType: 'mfa_disabled',
    severity: 'warning',
    actorUserId: userId,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
    details: { method: 'totp' },
  });
}

/**
 * Toggle email-OTP 2FA. Requires current password — same posture as the
 * TOTP enable/disable flows so a stolen access token can't drop the
 * second factor.
 */
export async function setEmailOtpEnabled(
  userId: string,
  enabled: boolean,
  currentPassword: string,
  ctx?: AuthEventContext
): Promise<void> {
  const r = await db.query<{ encrypted_password: string; totp_enabled: boolean | null }>(
    'SELECT encrypted_password, totp_enabled FROM public.auth_users WHERE id = $1',
    [userId]
  );
  const row = r.rows[0];
  if (!row) throw new ApiError('User not found', 404, 'NOT_FOUND');
  const ok = await bcrypt.compare(currentPassword, row.encrypted_password);
  if (!ok) {
    throw new ApiError('Current password is incorrect', 401, 'AUTH_INVALID_CREDENTIALS');
  }
  // Privileged users must always retain at least one second factor. If TOTP is
  // not enabled either, turning email OTP off would leave them with none.
  if (!enabled && row.totp_enabled !== true && (await isPrivilegedUser(userId))) {
    throw new ApiError(
      'Administrators must keep at least one form of two-factor authentication enabled.',
      403,
      'MFA_REQUIRED_FOR_ROLE'
    );
  }
  await db.query(
    'UPDATE public.auth_users SET email_otp_enabled = $1, updated_at = now() WHERE id = $2',
    [enabled, userId]
  );
  if (enabled) {
    await logSecurityEvent({
      eventType: 'mfa_enabled',
      severity: 'info',
      actorUserId: userId,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      details: { method: 'email_otp' },
    });
  } else {
    await bumpTokenVersion(userId, 'email_otp_disabled', ctx);
    await logSecurityEvent({
      eventType: 'mfa_disabled',
      severity: 'warning',
      actorUserId: userId,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      details: { method: 'email_otp' },
    });
  }
}

export async function getEmailOtpEnabled(userId: string): Promise<boolean> {
  const r = await db.query<{ email_otp_enabled: boolean }>(
    'SELECT email_otp_enabled FROM public.auth_users WHERE id = $1',
    [userId]
  );
  return r.rows[0]?.email_otp_enabled ?? true;
}

export async function signUp(
  email: string,
  password: string,
  metadata?: { firstName?: string; lastName?: string },
  consent?: { ip?: string | null; userAgent?: string | null }
): Promise<SignInResult> {
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

  // Create auth user. Note: email_confirmed_at stays NULL until the user
  // verifies the email OTP — that's what proves the address is real.
  const userResult = await db.query(
    `INSERT INTO public.auth_users (email, encrypted_password, email_confirmed_at, email_otp_enabled, created_at, updated_at)
     VALUES (lower($1), $2, NULL, true, now(), now())
     RETURNING id, email`,
    [email, hashedPassword]
  );
  const newUser = userResult.rows[0] as { id: string; email: string };

  // Create profile (without org -- they'll create/join one during onboarding).
  // organization_id is nullable; null means "no org yet".
  await db.query(
    `INSERT INTO public.profiles (user_id, email, first_name, last_name, organization_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NULL, now(), now())
     ON CONFLICT (user_id) DO NOTHING`,
    [newUser.id, newUser.email, metadata?.firstName || null, metadata?.lastName || null]
  );

  // Record acceptance of the Terms of Service + Privacy Policy as an
  // immutable audit row. The /sign-up route enforces `acceptedTerms === true`
  // before calling this, so reaching here means the user agreed. We stamp the
  // server-known current versions plus the request IP/User-Agent so an audit
  // can prove exactly which revision was accepted, when, and from where.
  await db.query(
    `INSERT INTO public.terms_acceptances (user_id, terms_version, privacy_version, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      newUser.id,
      CURRENT_TERMS_VERSION,
      CURRENT_PRIVACY_VERSION,
      consent?.ip ?? null,
      consent?.userAgent ?? null,
    ]
  );

  // Issue a signup-purpose email OTP. The client must verify before we
  // hand out session tokens — this is what blocks typo'd addresses from
  // ever being able to use the account.
  return issueMfaChallenge(newUser.id, newUser.email, 'email_otp', 'signup');
}

export function verifyAccessToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET!, { algorithms: ['HS256'] }) as JwtPayload & {
      mfa?: boolean;
      typ?: string;
    };
    if (payload.mfa) {
      throw new ApiError('MFA verification required', 401, 'AUTH_MFA_REQUIRED');
    }
    // Client-portal tokens are signed with the same secret but carry a
    // `typ: 'client*'` claim. They must NEVER authenticate the staff API —
    // reject them here so a client token can't be replayed as a staff token.
    if (typeof payload.typ === 'string' && payload.typ.startsWith('client')) {
      throw new ApiError('Invalid token', 401, 'AUTH_INVALID_TOKEN');
    }
    return {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.org,
      tokenVersion: payload.tv,
      impersonation: payload.imp,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError('Token expired', 401, 'AUTH_TOKEN_EXPIRED');
    }
    throw new ApiError('Invalid token', 401, 'AUTH_INVALID_TOKEN');
  }
}

export async function refreshTokens(
  refreshToken: string,
  ctx?: AuthEventContext
): Promise<AuthTokens> {
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
            au.token_version,
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
        token_version: number | null;
        organization_id: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | undefined;

  if (!user || !user.is_active) {
    throw new ApiError('Invalid refresh token', 401, 'AUTH_INVALID_REFRESH_TOKEN');
  }

  // Reuse detection: a well-formed, signature-valid refresh token that does NOT
  // match the stored hash — while a stored token still exists — is a replay of
  // a previously-rotated (or stolen) token. Treat the session family as
  // compromised: revoke all access tokens (bump epoch) and kill the refresh
  // family so neither the legitimate user nor the attacker can continue with
  // these credentials. Both must re-authenticate.
  if (
    !user.refresh_token ||
    !crypto.timingSafeEqual(Buffer.from(user.refresh_token), Buffer.from(refreshHash))
  ) {
    if (user.refresh_token) {
      await db.query(
        'UPDATE public.auth_users SET refresh_token = NULL, refresh_token_expires_at = NULL, token_version = token_version + 1, updated_at = now() WHERE id = $1',
        [user.id]
      );
      await logSecurityEvent({
        eventType: 'token_reuse_detected',
        severity: 'critical',
        actorUserId: user.id,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        details: { reason: 'refresh_token_replay' },
      });
    }
    throw new ApiError('Refresh token revoked', 401, 'AUTH_REFRESH_TOKEN_REVOKED');
  }

  if (user.refresh_token_expires_at && new Date(user.refresh_token_expires_at) < new Date()) {
    throw new ApiError('Refresh token expired', 401, 'AUTH_REFRESH_TOKEN_EXPIRED');
  }

  // Issue new tokens (rotate refresh token)
  const organizationId = await ensureOrganizationForUser({
    id: user.id,
    email: user.email,
    organization_id: user.organization_id,
    first_name: user.first_name,
    last_name: user.last_name,
  });
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    org: organizationId,
    tv: user.token_version ?? 0,
  };
  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(user.id);
  const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  const refreshExpires = new Date(Date.now() + parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN) * 1000);

  await db.query(
    `UPDATE public.auth_users SET refresh_token = $1, refresh_token_expires_at = $2, updated_at = now() WHERE id = $3`,
    [newRefreshHash, refreshExpires.toISOString(), user.id]
  );

  await logSecurityEvent({
    eventType: 'token_refreshed',
    severity: 'info',
    actorUserId: user.id,
    organizationId,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  });

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

export async function signOut(userId: string, ctx?: AuthEventContext): Promise<void> {
  await db.query(
    'UPDATE public.auth_users SET refresh_token = NULL, refresh_token_expires_at = NULL, updated_at = now() WHERE id = $1',
    [userId]
  );
  // Revoke outstanding access tokens too, not just the refresh token.
  await bumpTokenVersion(userId, 'logout', ctx);
  await logSecurityEvent({
    eventType: 'logout',
    severity: 'info',
    actorUserId: userId,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx?: AuthEventContext
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
  // Revoke outstanding access tokens too.
  await bumpTokenVersion(userId, 'password_changed', ctx);
  await logSecurityEvent({
    eventType: 'password_changed',
    severity: 'warning',
    actorUserId: userId,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  });
}

export async function resetPasswordRequest(email: string, ctx?: AuthEventContext): Promise<string> {
  const result = await db.query('SELECT id FROM public.auth_users WHERE lower(email) = lower($1)', [
    email,
  ]);

  // Always do equivalent work — generating a token and running an UPDATE
  // — so the response time doesn't reveal whether the email exists
  // (CWE-203). When the user doesn't exist, the UPDATE targets a sentinel
  // id that matches no row.
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 3600000); // 1 hour
  const targetId = result.rows[0]?.id ?? '00000000-0000-0000-0000-000000000000';

  await db.query(
    'UPDATE public.auth_users SET password_reset_token = $1, password_reset_expires_at = $2, updated_at = now() WHERE id = $3',
    [tokenHash, expires.toISOString(), targetId]
  );

  // Log the request regardless of whether the user exists; we record the
  // attempt without revealing existence (actorUserId is null for unknowns).
  await logSecurityEvent({
    eventType: 'password_reset_requested',
    severity: 'info',
    actorUserId: result.rows[0]?.id ?? null,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  });

  // If no real user, return a sentinel so the caller can decide whether
  // to actually send an email. Either way the timing matches.
  if (!result.rows[0]) return 'ok';

  // Return the raw token -- caller is responsible for emailing it
  return token;
}

export async function resetPasswordConfirm(
  token: string,
  newPassword: string,
  ctx?: AuthEventContext
): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await db.query(
    `SELECT id FROM public.auth_users WHERE password_reset_token = $1 AND password_reset_expires_at > now()`,
    [tokenHash]
  );

  if (!result.rows[0]) {
    throw new ApiError('Invalid or expired reset token', 400, 'AUTH_INVALID_RESET_TOKEN');
  }

  const resetUserId = result.rows[0].id as string;
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
    [hashedPassword, resetUserId]
  );
  // Revoke outstanding access tokens too.
  await bumpTokenVersion(resetUserId, 'password_reset', ctx);
  await logSecurityEvent({
    eventType: 'password_reset_completed',
    severity: 'warning',
    actorUserId: resetUserId,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  });
}
