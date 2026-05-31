/**
 * File storage service.
 *
 * Two drivers, selected by STORAGE_DRIVER:
 *   - 'fs' (default): local filesystem at STORAGE_PATH, used on the
 *     backend's Railway volume. Same behavior the codebase has shipped
 *     with since day one.
 *   - 's3' : any S3-compatible store (Garage on Railway, R2, AWS, etc.)
 *     selected via S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY.
 *
 * The public API (uploadFile / downloadFile / deleteFile / fileExists /
 * createSignedUrl / verifySignedUrl) is identical across drivers, so
 * callers (routes/api/*) don't change.
 *
 * Signed URLs continue to be backend-issued HMAC URLs that route through
 * /api/v1/files/* — the backend reads the object from whichever driver
 * is active and streams it back. This keeps the frontend untouched
 * during the cutover. Switching to native S3 presigned URLs is a later,
 * separate change.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';

import { env } from '../config/env.js';

const STORAGE_ROOT = env.STORAGE_PATH;
const USE_S3 = env.STORAGE_DRIVER === 's3';

// Single shared S3 client; only constructed when the driver is 's3' so
// the fs driver has zero S3 SDK overhead at import time.
const s3 = USE_S3
  ? new S3Client({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY!,
        secretAccessKey: env.S3_SECRET_KEY!,
      },
    })
  : null;

const S3_BUCKET = env.S3_BUCKET ?? '';

// ── Encryption-at-rest config ────────────────────────────────────────────────
//
// S3 path (production): every PutObject is written with server-side
// encryption. Defaults to SSE-S3 (AES256, key managed by the store) and
// upgrades to SSE-KMS automatically when S3_SSE_KMS_KEY_ID is set. These are
// read straight off process.env (config/env.ts is owned by another lane).
const S3_SSE_KMS_KEY_ID = process.env.S3_SSE_KMS_KEY_ID;
// ServerSideEncryption is a string-literal union in the SDK; cast through the
// command's expected type so env-driven values stay assignable.
const S3_SSE = (
  S3_SSE_KMS_KEY_ID ? 'aws:kms' : process.env.S3_SSE || 'AES256'
) as PutObjectCommandInput['ServerSideEncryption'];

// Local fs path: the at-rest control for the Railway volume is disk-level
// encryption on the volume itself (an infra concern, not application code).
// As defense-in-depth we ALSO support optional application-layer envelope
// encryption of each file's bytes, gated behind STORAGE_ENCRYPT_LOCAL=true.
// When enabled, bytes are sealed with AES-256-GCM under a key derived from
// APP_ENCRYPTION_KEY (sha256 → 32 bytes) and prefixed with a magic header so
// the read path can transparently decrypt new files while still serving any
// legacy plaintext files written before the flag was turned on.
const STORAGE_ENCRYPT_LOCAL = process.env.STORAGE_ENCRYPT_LOCAL === 'true';
// Magic header identifying an application-encrypted local file. Layout:
//   [8-byte magic]['KLENC' + version byte][12-byte IV][16-byte GCM tag][ciphertext]
const LOCAL_ENC_MAGIC = Buffer.from('KLENC\x01\x00', 'ascii'); // 7 bytes
const LOCAL_ENC_IV_LEN = 12;
const LOCAL_ENC_TAG_LEN = 16;

function localEncKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('STORAGE_ENCRYPT_LOCAL=true requires APP_ENCRYPTION_KEY to be set');
  }
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

/** Seal plaintext bytes for at-rest storage on the local fs driver. */
function encryptLocal(plaintext: Buffer): Buffer {
  const key = localEncKey();
  const iv = crypto.randomBytes(LOCAL_ENC_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([LOCAL_ENC_MAGIC, iv, tag, ciphertext]);
}

/**
 * Reverse of encryptLocal. If the stored bytes don't carry our magic header
 * (legacy plaintext file, or the flag wasn't on when it was written) the bytes
 * are returned untouched so existing files keep reading. Only files we wrote
 * with the header are decrypted, which makes the rollout symmetric and safe.
 */
function decryptLocal(stored: Buffer): Buffer {
  if (
    stored.length < LOCAL_ENC_MAGIC.length + LOCAL_ENC_IV_LEN + LOCAL_ENC_TAG_LEN ||
    !stored.subarray(0, LOCAL_ENC_MAGIC.length).equals(LOCAL_ENC_MAGIC)
  ) {
    return stored; // plaintext / legacy — serve as-is
  }
  const key = localEncKey();
  let off = LOCAL_ENC_MAGIC.length;
  const iv = stored.subarray(off, off + LOCAL_ENC_IV_LEN);
  off += LOCAL_ENC_IV_LEN;
  const tag = stored.subarray(off, off + LOCAL_ENC_TAG_LEN);
  off += LOCAL_ENC_TAG_LEN;
  const ciphertext = stored.subarray(off);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * S3 object key. We keep the existing `<bucket>/<filePath>` namespacing
 * convention by encoding the logical bucket as the first key segment
 * inside the single physical S3 bucket. That way one Garage bucket can
 * back every logical bucket (documents/, chat/, etc.) without
 * provisioning a new bucket per use case.
 */
function s3Key(bucket: string, filePath: string): string {
  return `${bucket}/${filePath}`;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (body == null) return Buffer.alloc(0);
  // Node stream
  if (typeof (body as { on?: unknown }).on === 'function') {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      (body as NodeJS.ReadableStream)
        .on('data', (chunk: Buffer | string) =>
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        )
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
  }
  // Web stream (Node 18+ SDK)
  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === 'function') {
    const arr = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(arr);
  }
  throw new Error('Unsupported S3 response body type');
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  filePath: string; // relative path within bucket
  size: number;
  // Hex SHA-256 of the bytes as written. Persisted by callers in the
  // documents table so a later read can detect silent corruption or
  // out-of-band tampering of the stored object.
  sha256: string;
}

/**
 * Mismatch between an object's stored bytes and the SHA-256 the caller
 * expected. Surface as a 500 to the user (this is a server-side
 * integrity failure, not a client error) and a hard signal in logs that
 * something is wrong with the storage backend.
 */
export class StorageIntegrityError extends Error {
  constructor(
    public readonly bucket: string,
    public readonly filePath: string,
    public readonly expected: string,
    public readonly actual: string
  ) {
    super(
      `Storage integrity check failed for ${bucket}/${filePath}: expected sha256=${expected}, got ${actual}`
    );
    this.name = 'StorageIntegrityError';
  }
}

function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export interface FileMetadata {
  contentType: string;
  size: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reject any path that contains `..`, absolute roots, NUL bytes, or
 * Windows drive letters. The previous implementation only stripped
 * leading `../`, leaving cross-tenant traversal viable through middle
 * segments like `orgA/../orgB/secret.pdf` (CWE-22, CWE-639).
 *
 * Throws on invalid input so callers get an explicit failure rather
 * than silently serving the wrong file.
 */
function bucketPath(bucket: string, filePath: string): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path');
  }
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: NUL byte');
  }
  // Normalize separators on POSIX for consistent comparisons.
  const normalized = path.posix.normalize(filePath.replace(/\\/g, '/'));
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('\\') ||
    /^[a-zA-Z]:[\\/]/.test(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..')
  ) {
    throw new Error('Invalid file path: traversal segment');
  }
  // Final safety check: the resolved absolute path must remain inside
  // STORAGE_ROOT/bucket.
  const bucketRoot = path.resolve(STORAGE_ROOT, bucket);
  const resolved = path.resolve(bucketRoot, normalized);
  if (resolved !== bucketRoot && !resolved.startsWith(bucketRoot + path.sep)) {
    throw new Error('Invalid file path: escapes bucket');
  }
  return resolved;
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function uploadFile(
  bucket: string,
  filePath: string,
  data: Buffer,
  contentType?: string
): Promise<UploadResult> {
  // Validate path even on S3 — same traversal rules apply because the
  // logical bucket is just a key prefix in the physical S3 bucket.
  bucketPath(bucket, filePath);

  const sha256 = sha256Hex(data);

  if (USE_S3) {
    await s3!.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key(bucket, filePath),
        Body: data,
        ContentType: contentType ?? mimeFromExt(path.extname(filePath).toLowerCase()),
        // Encryption at rest: SSE-S3 (AES256) by default, SSE-KMS when a
        // key id is configured. The store encrypts the object server-side
        // before it touches disk.
        ServerSideEncryption: S3_SSE,
        ...(S3_SSE === 'aws:kms' && S3_SSE_KMS_KEY_ID ? { SSEKMSKeyId: S3_SSE_KMS_KEY_ID } : {}),
        // Stored as x-amz-meta-sha256 so any external auditor (mc, aws
        // cli, browser of the bucket) can verify integrity without
        // touching our DB.
        Metadata: { sha256 },
      })
    );
    return { filePath, size: data.length, sha256 };
  }

  const fullPath = bucketPath(bucket, filePath);
  await ensureDir(path.dirname(fullPath));
  // At-rest control for the local fs driver is the encrypted Railway volume
  // (disk-level). When STORAGE_ENCRYPT_LOCAL=true we additionally seal the
  // bytes with AES-256-GCM as defense-in-depth; the read path detects the
  // magic header and decrypts, while legacy plaintext files still read.
  await fs.writeFile(fullPath, STORAGE_ENCRYPT_LOCAL ? encryptLocal(data) : data);
  return { filePath, size: data.length, sha256 };
}

export interface DownloadOptions {
  /**
   * Hex SHA-256 the caller expects this object to have (as captured at
   * upload time and persisted in the documents table). If supplied, the
   * downloaded bytes are hashed and compared; on mismatch we throw
   * StorageIntegrityError rather than serving silently-corrupted or
   * out-of-band-edited content.
   *
   * Callers without the expected hash (e.g. legacy rows pre-dating the
   * sha256 column) can omit this and accept the bytes as-is.
   */
  expectedSha256?: string;
}

export async function downloadFile(
  bucket: string,
  filePath: string,
  options?: DownloadOptions
): Promise<{ data: Buffer; contentType: string; sha256: string }> {
  bucketPath(bucket, filePath);

  if (USE_S3) {
    try {
      const out = await s3!.send(
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(bucket, filePath) })
      );
      const data = await streamToBuffer(out.Body);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = out.ContentType ?? mimeFromExt(ext);
      const sha256 = sha256Hex(data);
      if (options?.expectedSha256 && options.expectedSha256 !== sha256) {
        throw new StorageIntegrityError(bucket, filePath, options.expectedSha256, sha256);
      }
      return { data, contentType, sha256 };
    } catch (err) {
      if (err instanceof StorageIntegrityError) throw err;
      const name = (err as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw err;
    }
  }

  const fullPath = bucketPath(bucket, filePath);
  try {
    const raw = await fs.readFile(fullPath);
    // Transparently decrypt files we sealed at write time; legacy plaintext
    // files (no magic header) pass through unchanged. SHA-256 is computed on
    // the plaintext so it matches the hash captured at upload.
    const data = decryptLocal(raw);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeFromExt(ext);
    const sha256 = sha256Hex(data);
    if (options?.expectedSha256 && options.expectedSha256 !== sha256) {
      throw new StorageIntegrityError(bucket, filePath, options.expectedSha256, sha256);
    }
    return { data, contentType, sha256 };
  } catch (err) {
    if (err instanceof StorageIntegrityError) throw err;
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw err;
  }
}

export async function deleteFile(bucket: string, filePath: string): Promise<void> {
  bucketPath(bucket, filePath);

  if (USE_S3) {
    // S3 DeleteObject is idempotent — no NoSuchKey to swallow.
    await s3!.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(bucket, filePath) }));
    return;
  }

  const fullPath = bucketPath(bucket, filePath);
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

export async function fileExists(bucket: string, filePath: string): Promise<boolean> {
  bucketPath(bucket, filePath);

  if (USE_S3) {
    try {
      await s3!.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key(bucket, filePath) }));
      return true;
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') return false;
      throw err;
    }
  }

  try {
    await fs.access(bucketPath(bucket, filePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a time-limited signed URL.
 *
 * The signature covers `bucket:filePath:expires:audience` where `audience`
 * is the organization id the URL was issued to. The verifier later
 * cross-checks that the filePath actually starts with that org prefix —
 * defense in depth so that even if a code path forgets to org-scope its
 * filePath, the URL is rejected at retrieval time.
 *
 * `expiresInSeconds` defaults to 5 minutes — short-lived URLs limit the
 * blast radius if one is logged or shared accidentally.
 */
export function createSignedUrl(
  bucket: string,
  filePath: string,
  expiresInSeconds: number,
  audience?: string
): string {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const aud = audience ?? '';
  const payload = `${bucket}:${filePath}:${expires}:${aud}`;
  // Prefer a dedicated signed-URL HMAC key (segregated from JWT_SECRET to limit
  // blast radius on a leak); fall back to JWT_SECRET so URLs signed before
  // SIGNED_URL_SECRET was introduced keep verifying. Either way we use the
  // validated env so we never fall back to a public 'dev-secret' string; if
  // JWT_SECRET is missing too, env.ts already refused to boot.
  const secret = env.SIGNED_URL_SECRET ?? env.JWT_SECRET ?? '';
  if (!secret) {
    throw new Error('Signed-URL secret is not configured (SIGNED_URL_SECRET / JWT_SECRET)');
  }
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const backendUrl =
    process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${process.env.PORT || 4000}`;

  const baseUrl = process.env.BACKEND_PUBLIC_URL || backendUrl;

  const audSegment = aud ? `&aud=${encodeURIComponent(aud)}` : '';
  return `${baseUrl}/api/v1/files/${bucket}/${encodeURIComponent(filePath)}?expires=${expires}&sig=${signature}${audSegment}`;
}

export function verifySignedUrl(
  bucket: string,
  filePath: string,
  expires: string,
  signature: string,
  audience?: string
): boolean {
  const expiresNum = parseInt(expires, 10);
  if (isNaN(expiresNum) || expiresNum < Math.floor(Date.now() / 1000)) {
    return false; // expired
  }

  const aud = audience ?? '';
  // If an audience is embedded, the file path MUST start with `${aud}/`.
  // This catches the case where a caller forgot to org-scope the path.
  if (aud && !filePath.startsWith(`${aud}/`)) {
    return false;
  }

  const payload = `${bucket}:${filePath}:${expiresNum}:${aud}`;
  // Must match createSignedUrl's key selection exactly: dedicated
  // SIGNED_URL_SECRET when set, otherwise JWT_SECRET so pre-existing URLs still
  // verify. Validated env only — never a public 'dev-secret' fallback.
  const secret = env.SIGNED_URL_SECRET ?? env.JWT_SECRET ?? '';
  if (!secret) {
    throw new Error('Signed-URL secret is not configured (SIGNED_URL_SECRET / JWT_SECRET)');
  }
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(signature);
  if (expectedBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

// ── MIME helper ─────────────────────────────────────────────────────────────

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.webm': 'audio/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  };
  return map[ext] || 'application/octet-stream';
}
