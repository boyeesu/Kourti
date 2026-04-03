/**
 * File storage service.
 * Uses local filesystem (Railway volume) by default.
 * Can be swapped to S3 by setting S3_BUCKET env var.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

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

function bucketPath(bucket: string, filePath: string): string {
  // Prevent path traversal
  const safe = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  return path.join(STORAGE_ROOT, bucket, safe);
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
 * For local storage, we generate a token-based URL that the backend validates.
 */
export function createSignedUrl(
  bucket: string,
  filePath: string,
  expiresInSeconds: number
): string {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${bucket}:${filePath}:${expires}`;
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const backendUrl =
    process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${process.env.PORT || 4000}`;

  const baseUrl = process.env.BACKEND_PUBLIC_URL || backendUrl;

  return `${baseUrl}/api/v1/files/${bucket}/${encodeURIComponent(filePath)}?expires=${expires}&sig=${signature}`;
}

export function verifySignedUrl(
  bucket: string,
  filePath: string,
  expires: string,
  signature: string
): boolean {
  const expiresNum = parseInt(expires, 10);
  if (isNaN(expiresNum) || expiresNum < Math.floor(Date.now() / 1000)) {
    return false; // expired
  }

  const payload = `${bucket}:${filePath}:${expiresNum}`;
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
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
