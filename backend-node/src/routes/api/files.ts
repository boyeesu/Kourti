import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { ApiError, asyncHandler } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  uploadFile,
  downloadFile,
  deleteFile,
  createSignedUrl,
  verifySignedUrl,
} from '../../services/storage.js';

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

    // Scope file path to organization. Strip every char that isn't safe so
    // ".." and similar can't survive inside the original filename.
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    const fileName = `${auth.organizationId}/${Date.now()}-${safeName || 'file'}`;

    const result = await uploadFile('documents', fileName, file.buffer, file.mimetype);

    res.status(201).json({
      filePath: result.filePath,
      fileName: file.originalname,
      size: result.size,
      mimeType: file.mimetype,
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

    const result = await uploadFile('Chat_Storage', fileName, file.buffer, file.mimetype);

    res.status(201).json({
      filePath: result.filePath,
      fileName: file.originalname,
      size: result.size,
      mimeType: file.mimetype,
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

    const { data, contentType } = await downloadFile('documents', filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', data.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', safeDisposition(contentType));
    res.send(data);
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

    const { data, contentType } = await downloadFile(bucket, filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', data.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', safeDisposition(contentType));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
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
