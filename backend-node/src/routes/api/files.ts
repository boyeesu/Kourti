import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { scanBuffer, isScanEnforced } from '../../services/clamav.js';
import { enforceStorageLimit } from '../../services/limits.js';
import { logSecurityEvent, eventContextFromRequest } from '../../services/securityEvents.js';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  createSignedUrl,
  verifySignedUrl,
  StorageIntegrityError,
} from '../../services/storage.js';

/**
 * Scan the incoming buffer with ClamAV (when configured). Behavior:
 *   - clean → returns silently
 *   - infected, CLAMAV_MODE=enforce → throws 422 MALWARE_DETECTED
 *   - infected, CLAMAV_MODE=warn → logs at error level and lets it through
 *   - scanner unconfigured / unreachable / protocol error:
 *       · enforced (isScanEnforced, e.g. production or CLAMAV_MODE=enforce)
 *         → fail CLOSED: throws 503 MALWARE_SCAN_UNAVAILABLE so we never
 *           store a document we couldn't scan (SOC 2 / CC6)
 *       · otherwise (dev/local, no sidecar, CLAMAV_MODE=warn) → fail OPEN:
 *         logs and lets the upload through so local dev stays frictionless
 *
 * Hook into both upload routes so chat and document attachments get the
 * same coverage.
 */
async function scanOrThrow(
  buffer: Buffer,
  filename: string,
  ctx: { userId: string; organizationId: string; bucket: string }
): Promise<void> {
  try {
    const result = await scanBuffer(buffer);
    if (!result.scanned) {
      // Scanner is not configured. In enforced mode this is fail-closed.
      if (isScanEnforced()) {
        console.error('[clamav] scanner not configured but enforcement is on', {
          filename,
          bucket: ctx.bucket,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
        });
        throw new ApiError(
          'Malware scanning is required but unavailable. Please retry shortly.',
          503,
          'MALWARE_SCAN_UNAVAILABLE'
        );
      }
      return;
    }
    if (result.ok) return;

    console.error('[clamav] infected upload blocked', {
      virus: result.virus,
      filename,
      bucket: ctx.bucket,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      mode: env.CLAMAV_MODE,
    });
    if (env.CLAMAV_MODE === 'enforce') {
      throw new ApiError(
        `File rejected: malware signature "${result.virus}" detected.`,
        422,
        'MALWARE_DETECTED'
      );
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;

    // Scanner unreachable / protocol error. Fail CLOSED when enforced,
    // otherwise fall through to fail-open for local dev.
    if (isScanEnforced()) {
      console.error('[clamav] scanner unreachable, failing closed', {
        error: err instanceof Error ? err.message : String(err),
        filename,
        bucket: ctx.bucket,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      });
      throw new ApiError(
        'Malware scanning is required but unavailable. Please retry shortly.',
        503,
        'MALWARE_SCAN_UNAVAILABLE'
      );
    }

    console.error('[clamav] scanner unreachable, failing open', {
      error: err instanceof Error ? err.message : String(err),
      filename,
      bucket: ctx.bucket,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });
  }
}

/**
 * Look up the expected SHA-256 for a stored file_path in the documents
 * table. Returns undefined when:
 *   - the row predates the sha256 column (legacy upload, no expectation
 *     to enforce)
 *   - the path lives in a non-documents bucket (chat, etc.) — those
 *     don't currently persist their hash and are read unverified
 *
 * Errors are swallowed: integrity verification is best-effort, never a
 * reason to block an otherwise-valid download.
 */
async function lookupExpectedSha256(bucket: string, filePath: string): Promise<string | undefined> {
  if (bucket !== 'documents') return undefined;
  try {
    const res = await db.query<{ sha256: string | null }>(
      `select sha256 from public.documents where file_path = $1 limit 1`,
      [filePath]
    );
    return res.rows[0]?.sha256 ?? undefined;
  } catch {
    return undefined;
  }
}

// MIME allowlist. Anything not on this list is rejected at upload time
// rather than risk it being served back via a signed URL where the
// browser may render it (e.g. HTML / SVG → stored XSS on the auth domain).
const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'audio/webm',
  'audio/mpeg',
  'audio/wav',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 26 * 1024 * 1024 }, // 26MB max
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new ApiError(`Unsupported file type: ${file.mimetype}`, 415, 'UNSUPPORTED_MEDIA_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/**
 * Pick a safe Content-Disposition for a given MIME. PDFs and images may
 * be inlined; everything else is forced as an attachment so it never
 * renders on our origin even if a signed URL escapes the app.
 */
function safeDisposition(mime: string, filename?: string): string {
  const inlineSafe = mime === 'application/pdf' || mime.startsWith('image/');
  const verb = inlineSafe ? 'inline' : 'attachment';
  if (!filename) return verb;
  const safe = filename.replace(/[\r\n"\\]+/g, '_');
  return `${verb}; filename="${safe}"`;
}

export const filesRouter = Router();

// ── Upload to documents bucket ──────────────────────────────────────────────

filesRouter.post(
  '/documents/upload',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const file = req.file;
    if (!file) {
      throw new ApiError('No file provided', 400, 'VALIDATION_ERROR');
    }

    // Enforce the plan's document-storage cap using the REAL uploaded size
    // (file.size), not a client-reported value — checked before we store the
    // bytes so an over-cap upload is rejected, not persisted.
    const usageRes = await db.query<{ bytes: string | null }>(
      `select coalesce(sum(file_size), 0)::bigint as bytes
         from public.documents where organization_id = $1`,
      [auth.organizationId]
    );
    await enforceStorageLimit(
      auth.organizationId,
      Number(usageRes.rows[0]?.bytes ?? 0),
      file.size,
      auth.userId
    );

    // Scope file path to organization. Strip every char that isn't safe so
    // ".." and similar can't survive inside the original filename.
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    const fileName = `${auth.organizationId}/${Date.now()}-${safeName || 'file'}`;

    await scanOrThrow(file.buffer, file.originalname, {
      userId: auth.userId,
      organizationId: auth.organizationId,
      bucket: 'documents',
    });

    const result = await uploadFile('documents', fileName, file.buffer, file.mimetype);

    res.status(201).json({
      filePath: result.filePath,
      fileName: file.originalname,
      size: result.size,
      mimeType: file.mimetype,
      sha256: result.sha256,
    });
  })
);

// ── Upload to chat storage ──────────────────────────────────────────────────

filesRouter.post(
  '/chat/upload',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const file = req.file;
    if (!file) {
      throw new ApiError('No file provided', 400, 'VALIDATION_ERROR');
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    const fileName = `${auth.organizationId}/${auth.userId}/${Date.now()}-${safeName || 'file'}`;

    await scanOrThrow(file.buffer, file.originalname, {
      userId: auth.userId,
      organizationId: auth.organizationId,
      bucket: 'Chat_Storage',
    });

    const result = await uploadFile('Chat_Storage', fileName, file.buffer, file.mimetype);

    res.status(201).json({
      filePath: result.filePath,
      fileName: file.originalname,
      size: result.size,
      mimeType: file.mimetype,
      sha256: result.sha256,
    });
  })
);

// ── Download (authenticated) ────────────────────────────────────────────────

filesRouter.get(
  '/documents/download/*',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const filePath = req.params[0];
    if (!filePath) {
      throw new ApiError('File path required', 400, 'VALIDATION_ERROR');
    }

    // Org scoping: file path must start with the user's org ID
    if (!filePath.startsWith(`${auth.organizationId}/`)) {
      throw new ApiError('Access denied', 403, 'FORBIDDEN');
    }

    try {
      const expectedSha256 = await lookupExpectedSha256('documents', filePath);
      const { data, contentType } = await downloadFile('documents', filePath, {
        expectedSha256,
      });
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', data.length);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', safeDisposition(contentType));
      res.send(data);

      // SOC 2 audit trail: who downloaded which document. Non-blocking —
      // logSecurityEvent never throws. filePath is a path, not a secret.
      void logSecurityEvent({
        ...eventContextFromRequest(req),
        eventType: 'document_downloaded',
        targetType: 'document',
        targetId: filePath,
        details: { bucket: 'documents', filePath, contentType, size: data.length },
      });
    } catch (err) {
      if (err instanceof StorageIntegrityError) {
        // Hard signal — bytes on disk don't match what we recorded at
        // upload. Refuse to serve, page someone.

        console.error('[storage-integrity]', err.message);
        throw new ApiError(
          'File failed integrity check and is unavailable.',
          500,
          'STORAGE_INTEGRITY_FAILED'
        );
      }
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('File not found')) {
        throw new ApiError('Document not found', 404, 'NOT_FOUND');
      }
      throw err;
    }
  })
);

// ── Signed URL (authenticated) ──────────────────────────────────────────────

filesRouter.get(
  '/documents/signed-url',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const filePath = z.string().min(1).parse(req.query.filePath);
    const expiresIn = Number(req.query.expiresIn) || 3600;

    if (!filePath.startsWith(`${auth.organizationId}/`)) {
      throw new ApiError('Access denied', 403, 'FORBIDDEN');
    }

    const signedUrl = createSignedUrl('documents', filePath, expiresIn, auth.organizationId);

    res.status(200).json({
      signedUrl,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });
  })
);

filesRouter.get(
  '/chat/signed-url',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const filePath = z.string().min(1).parse(req.query.filePath);
    const expiresIn = Number(req.query.expiresIn) || 3600;

    if (!filePath.startsWith(`${auth.organizationId}/`)) {
      throw new ApiError('Access denied', 403, 'FORBIDDEN');
    }

    const signedUrl = createSignedUrl('Chat_Storage', filePath, expiresIn, auth.organizationId);

    res.status(200).json({
      signedUrl,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });
  })
);

// ── Public signed URL access (no auth -- URL is the credential) ─────────────

filesRouter.get(
  '/:bucket/*',
  asyncHandler(async (req, res) => {
    const bucket = req.params.bucket;
    const filePath = req.params[0];
    const { expires, sig, aud } = req.query as { expires?: string; sig?: string; aud?: string };

    if (!bucket || !filePath || !expires || !sig) {
      throw new ApiError('Invalid signed URL', 400, 'VALIDATION_ERROR');
    }

    if (!verifySignedUrl(bucket, filePath, expires, sig, aud)) {
      throw new ApiError('Expired or invalid signed URL', 403, 'FORBIDDEN');
    }

    try {
      const expectedSha256 = await lookupExpectedSha256(bucket, filePath);
      const { data, contentType } = await downloadFile(bucket, filePath, {
        expectedSha256,
      });
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', data.length);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', safeDisposition(contentType));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(data);

      // SOC 2 audit trail: a signed URL was redeemed to pull a file out of
      // the app boundary. There's no req.auth here (the URL is the
      // credential), so we carry the org via the URL's audience. Treated as
      // an export and flagged 'warning' since the bytes left via a shareable
      // link. Non-blocking; filePath/key are paths, not secrets.
      void logSecurityEvent({
        ...eventContextFromRequest(req),
        eventType: 'document_exported',
        severity: 'warning',
        actorType: 'system',
        organizationId: aud ?? null,
        targetType: 'document',
        targetId: filePath,
        details: { bucket, filePath, contentType, size: data.length, via: 'signed_url' },
      });
    } catch (err) {
      if (err instanceof StorageIntegrityError) {
        console.error('[storage-integrity]', err.message);
        throw new ApiError(
          'File failed integrity check and is unavailable.',
          500,
          'STORAGE_INTEGRITY_FAILED'
        );
      }
      throw err;
    }
  })
);

// ── Delete ──────────────────────────────────────────────────────────────────

filesRouter.delete(
  '/documents/*',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const filePath = req.params[0];

    if (!filePath?.startsWith(`${auth.organizationId}/`)) {
      throw new ApiError('Access denied', 403, 'FORBIDDEN');
    }

    await deleteFile('documents', filePath);
    res.status(204).send();
  })
);

filesRouter.delete(
  '/chat/*',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const filePath = req.params[0];
    if (!filePath) {
      throw new ApiError('File path required', 400, 'VALIDATION_ERROR');
    }

    if (!filePath.startsWith(`${auth.organizationId}/`)) {
      throw new ApiError('Access denied', 403, 'FORBIDDEN');
    }

    await deleteFile('Chat_Storage', filePath);
    res.status(204).send();
  })
);
