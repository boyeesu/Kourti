/**
 * RFC 6238 (TOTP) + RFC 4226 (HOTP) implementation in pure Node crypto.
 *
 * No external dep — `otplib` and `speakeasy` would add a transitive
 * uuid/crypto dependency for ~200 lines of well-understood code.
 *
 * Usage:
 *   const secret = generateTotpSecret();           // base32, 32 chars
 *   const uri = buildTotpUri(secret, email);       // for QR code
 *   verifyTotp(secret, '123456')                   // boolean
 */

import crypto from 'node:crypto';

// ── base32 (RFC 4648) ────────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(str: string): Buffer {
  const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── HOTP / TOTP ──────────────────────────────────────────────────────

function hotp(secret: Buffer, counter: number, digits = 6): string {
  // 8-byte big-endian counter
  const buf = Buffer.alloc(8);
  // bitwise ops on 32-bit halves to avoid BigInt for portability
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

const STEP_SECONDS = 30;

/**
 * Verify a 6-digit TOTP code. Accepts a ±1 step window (30s either way)
 * to tolerate clock skew. Returns false on invalid base32, wrong
 * length, or no match.
 */
export function verifyTotp(secretBase32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  // Constant-time compare against each candidate; loop to avoid
  // short-circuit timing leaks even on wrong-length input.
  let match = false;
  for (const offset of [-1, 0, 1]) {
    const expected = hotp(secret, counter + offset);
    if (
      expected.length === code.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))
    ) {
      match = true;
    }
  }
  return match;
}

/**
 * Generate a fresh 20-byte random secret encoded as 32 base32 chars.
 * 20 bytes = 160 bits is the RFC 4226 recommendation.
 */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Build the otpauth:// URI used by authenticator apps (Google
 * Authenticator, 1Password, Authy, etc) to enrol via QR code.
 */
export function buildTotpUri(secret: string, accountEmail: string, issuer = 'Kourti'): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: String(STEP_SECONDS),
  });
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Recovery codes ───────────────────────────────────────────────────

/**
 * Generate N single-use recovery codes. Each is 10 hex chars in two
 * groups (e.g. "a1b2c-3d4e5"). Returned plaintext for the user to save;
 * caller persists only the SHA-256 hashes.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex');
    out.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return out;
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(code.replace(/-/g, '').toLowerCase()).digest('hex');
}

export function verifyRecoveryCode(
  plaintext: string,
  hashes: string[]
): { ok: boolean; index: number } {
  const want = hashRecoveryCode(plaintext);
  for (let i = 0; i < hashes.length; i++) {
    if (
      hashes[i] &&
      hashes[i].length === want.length &&
      crypto.timingSafeEqual(Buffer.from(hashes[i]), Buffer.from(want))
    ) {
      return { ok: true, index: i };
    }
  }
  return { ok: false, index: -1 };
}
