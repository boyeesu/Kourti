/**
 * File storage service.
 * Uses local filesystem (Railway volume) by default.
 * Can be swapped to S3 by setting S3_BUCKET env var.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { env } from '../config/env.js';

const STORAGE_ROOT = process.env.STORAGE_PATH || '/app/storage';

// ── Types ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  filePath: string; // relative path within bucket
  size: number;
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
  _contentType?: string
): Promise<UploadResult> {
  const fullPath = bucketPath(bucket, filePath);
  await ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, data);
  return { filePath, size: data.length };
}

export async function downloadFile(
  bucket: string,
  filePath: string
): Promise<{ data: Buffer; contentType: string }> {
  const fullPath = bucketPath(bucket, filePath);
  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeFromExt(ext);
    return { data, contentType };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw err;
  }
}

export async function deleteFile(bucket: string, filePath: string): Promise<void> {
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
  // Use the validated env so we never fall back to a public 'dev-secret'
  // string; if JWT_SECRET is missing, env.ts already refused to boot.
  const secret = env.JWT_SECRET ?? '';
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
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
  // Use the validated env so we never fall back to a public 'dev-secret'
  // string; if JWT_SECRET is missing, env.ts already refused to boot.
  const secret = env.JWT_SECRET ?? '';
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
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
