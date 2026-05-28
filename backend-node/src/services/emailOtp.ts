import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { ApiError } from '../lib/http.js';
import { sendEmailOtpEmail } from './email.js';

export type EmailOtpPurpose = 'login' | 'signup' | 'enable_2fa';

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 600; // 10 minutes
const MAX_ATTEMPTS = 5;
// Throttle: don't allow generating more than one OTP every 30s for the same
// (user, purpose) pair — protects against email bombing.
const RESEND_COOLDOWN_SECONDS = 30;

function generateNumericCode(length = OTP_LENGTH): string {
  // Reject-sample to avoid modulo bias on 10 digits per draw.
  let out = '';
  while (out.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < 250) out += (byte % 10).toString();
  }
  return out;
}

// HMAC-SHA256 with the server's JWT_SECRET as the key. Prevents a
// read-only DB leak from being brute-forced: without the key, the
// 10^6 codespace is computationally inaccessible.
function hashCode(code: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET!).update(code).digest('hex');
}

/**
 * Generate and send an email OTP. Invalidates any prior un-used codes for
 * the same (user, purpose) so only the most recent one is valid.
 */
export async function issueEmailOtp(
  userId: string,
  email: string,
  purpose: EmailOtpPurpose
): Promise<void> {
  // Cooldown check
  const recent = await db.query<{ created_at: string }>(
    `select created_at from public.email_otp_codes
       where user_id = $1 and purpose = $2 and used_at is null
       order by created_at desc limit 1`,
    [userId, purpose]
  );
  if (recent.rows[0]) {
    const ageMs = Date.now() - new Date(recent.rows[0].created_at).getTime();
    if (ageMs < RESEND_COOLDOWN_SECONDS * 1000) {
      const wait = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - ageMs) / 1000);
      throw new ApiError(
        `Please wait ${wait}s before requesting another code`,
        429,
        'OTP_COOLDOWN'
      );
    }
  }

  // Burn any prior unused codes
  await db.query(
    `update public.email_otp_codes set used_at = now()
       where user_id = $1 and purpose = $2 and used_at is null`,
    [userId, purpose]
  );

  const code = generateNumericCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  await db.query(
    `insert into public.email_otp_codes (user_id, purpose, code_hash, expires_at)
     values ($1, $2, $3, $4)`,
    [userId, purpose, codeHash, expiresAt.toISOString()]
  );

  await sendEmailOtpEmail(email, code, purpose);
}

/**
 * Verify an OTP. Returns true on success. Single-use: marks the code as
 * consumed. Tracks attempts to block brute force.
 */
export async function verifyEmailOtp(
  userId: string,
  purpose: EmailOtpPurpose,
  code: string
): Promise<void> {
  const cleaned = code.trim();
  if (!/^\d{4,8}$/.test(cleaned)) {
    throw new ApiError('Invalid verification code', 400, 'OTP_INVALID_FORMAT');
  }

  const r = await db.query<{
    id: string;
    code_hash: string;
    expires_at: string;
    attempts: number;
    used_at: string | null;
  }>(
    `select id, code_hash, expires_at, attempts, used_at
       from public.email_otp_codes
       where user_id = $1 and purpose = $2
       order by created_at desc limit 1`,
    [userId, purpose]
  );
  const row = r.rows[0];
  if (!row || row.used_at) {
    throw new ApiError('No active verification code. Request a new one.', 400, 'OTP_NOT_FOUND');
  }
  if (new Date(row.expires_at) < new Date()) {
    throw new ApiError('Verification code has expired. Request a new one.', 400, 'OTP_EXPIRED');
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    // Burn it so the user must request a fresh code.
    await db.query(`update public.email_otp_codes set used_at = now() where id = $1`, [row.id]);
    throw new ApiError(
      'Too many incorrect attempts. Request a new code.',
      429,
      'OTP_TOO_MANY_ATTEMPTS'
    );
  }

  const submitted = hashCode(cleaned);
  const expected = Buffer.from(row.code_hash, 'hex');
  const got = Buffer.from(submitted, 'hex');
  const ok = expected.length === got.length && crypto.timingSafeEqual(expected, got);

  if (!ok) {
    await db.query(`update public.email_otp_codes set attempts = attempts + 1 where id = $1`, [
      row.id,
    ]);
    throw new ApiError('Invalid verification code', 401, 'OTP_INVALID');
  }

  await db.query(`update public.email_otp_codes set used_at = now() where id = $1`, [row.id]);
}
