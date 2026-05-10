/**
 * Document version routes.
 *
 * Mounted at /api/v1/documents/:id/versions, exposes:
 *   GET    /                — list all versions of a document
 *   POST   /:versionId/activate — set documents.current_version_id
 *   GET    /:versionId/download   — signed URL to download a specific version
 */

import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { listVersions, loadActiveVersion } from '../../lib/documentVersions.js';
import { createSignedUrl } from '../../services/storage.js';

export const documentVersionsRouter = Router({ mergeParams: true });

const documentParamsSchema = z.object({
  id: z.string().uuid(),
});
const versionParamsSchema = z.object({
  versionId: z.string().uuid(),
});

async function ensureDocumentBelongsToOrg(documentId: string, organizationId: string) {
  const r = await db.query<{ id: string }>(
    `select id from public.documents where id = $1 and organization_id = $2 limit 1`,
    [documentId, organizationId]
  );
  if (!r.rows[0]) throw new ApiError('Document not found', 404, 'NOT_FOUND');
}

documentVersionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { id } = documentParamsSchema.parse(req.params);
    await ensureDocumentBelongsToOrg(id, organizationId);
    const versions = await listVersions(id, organizationId);
    res.json({ success: true, data: versions });
  })
);

documentVersionsRouter.post(
  '/:versionId/activate',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { id } = documentParamsSchema.parse(req.params);
    const { versionId } = versionParamsSchema.parse(req.params);
    await ensureDocumentBelongsToOrg(id, organizationId);

    const exists = await db.query<{ id: string }>(
      `select id from public.document_versions
        where id = $1 and document_id = $2 and organization_id = $3`,
      [versionId, id, organizationId]
    );
    if (!exists.rows[0]) throw new ApiError('Version not found', 404, 'NOT_FOUND');

    await db.query(
      `update public.documents set current_version_id = $1, updated_at = now()
        where id = $2 and organization_id = $3`,
      [versionId, id, organizationId]
    );
    res.json({ success: true, data: { activated: versionId } });
  })
);

documentVersionsRouter.get(
  '/:versionId/download',
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { id } = documentParamsSchema.parse(req.params);
    const { versionId } = versionParamsSchema.parse(req.params);

    const active = await loadActiveVersion(id, organizationId, versionId);
    if (!active) throw new ApiError('Version not found', 404, 'NOT_FOUND');

    const expiresIn = z.coerce
      .number()
      .int()
      .min(30)
      .max(3600)
      .default(300)
      .parse(req.query.expiresIn ?? 300);

    const signedUrl = createSignedUrl('documents', active.storage_path, expiresIn, organizationId);
    res.json({
      success: true,
      data: {
        signedUrl,
        expiresIn,
        versionId: active.version_id,
        versionNumber: active.version_number,
      },
    });
  })
);
