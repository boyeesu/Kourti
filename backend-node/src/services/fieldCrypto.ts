import crypto from 'node:crypto';

import { env } from '../config/env.js';

/**
 * Authenticated symmetric encryption for sensitive fields stored at rest
 * (currently TOTP secrets). AES-256-GCM with a key derived from
 * APP_ENCRYPTION_KEY (preferred) or, as a fallback so non-prod works without
 * extra config, from JWT_SECRET. Production should set APP_ENCRYPTION_KEY to a
 * dedicated 32+ byte value — see env.ts for the boot-time guard.
 *
 * Ciphertext format (single string, safe to store in a text column):
 *   enc:v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 *
 * Values that are not in this format are treated as legacy plaintext by
 * `decryptField`, which lets us migrate existing rows lazily (read plaintext,
 * re-write encrypted on next update) without a backfill.
 */

const PREFIX = 'enc:v1:';

function key(): Buffer {
  const material =
    process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.length > 0
      ? process.env.APP_ENCRYPTION_KEY
      : env.JWT_SECRET || 'kourti-field-crypto-dev-fallback';
  // Derive a fixed 32-byte key regardless of input length.
  //
  // HARDENING NOTE (VAPT Low): single-pass SHA-256 is an acceptable KDF here
  // given a >=32-char random APP_ENCRYPTION_KEY, but crypto.hkdfSync (with a
  // per-use `info` label and salt) would be the stronger choice. NOT changed:
  // altering this derivation would change the AES key and make every existing
  // encrypted field (e.g. TOTP secrets at rest) undecryptable without a backfill.
  return crypto.createHash('sha256').update(String(material)).digest();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Decrypts a value produced by `encryptField`. If the value is not in the
 * encrypted format it is returned as-is (legacy plaintext support). Returns
 * null for null/empty input.
 */
export function decryptField(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (!isEncrypted(value)) return value; // legacy plaintext
  const body = value.slice(PREFIX.length);
  const [ivB64, tagB64, ctB64] = body.split(':');
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('fieldCrypto: malformed ciphertext');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}
